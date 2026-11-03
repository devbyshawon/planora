import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import User from "../src/models/User.js";
import Task from "../src/models/Task.js";
import Series from "../src/models/RecurrenceSeries.js";
import Template from "../src/models/Template.js";
import Action from "../src/models/OfflineAction.js";
import SiteSettings from "../src/models/SiteSettings.js";
import { localNonTask, materializeLocal } from "../../client/src/offline/domain.js";
let db, app, n=0;
const origin="http://localhost:5173", write=r=>r.set("Origin",origin).set("X-Planora-Client","web");
const id=()=>new mongoose.Types.ObjectId().toString();
const fields={title:"Offline original UI",notes:"",category:"study",priority:"medium",status:"scheduled",location:"calendar",date:"2026-11-03",startTime:"09:15",endTime:"09:55"};
before(async()=>{db=await MongoMemoryReplSet.create({replSet:{count:1},instanceOpts:[{args:["--nounixsocket"]}]});await mongoose.connect(db.getUri());await Promise.all([User.init(),Task.init(),Series.init(),Template.init(),Action.init(),SiteSettings.init()]);});
beforeEach(async()=>{await Promise.all([User.deleteMany({}),Task.deleteMany({}),Series.deleteMany({}),Template.deleteMany({}),Action.deleteMany({}),SiteSettings.deleteMany({})]);app=createApp({production:false,appOrigin:origin,jwtSecret:"offline-action-test-long-private-secret-123456"});});
after(async()=>{await mongoose.disconnect();await db.stop();});
async function account(){const agent=request.agent(app);const result=await write(agent.post("/api/auth/register")).send({name:"Test",email:`action-${++n}@example.com`,password:"OfflineTestPassword123",timeZone:"Asia/Dhaka"});assert.equal(result.status,201);return{agent,user:result.body.user};}
const snapshot=async agent=>{const r=await agent.get("/api/offline/snapshot");assert.equal(r.status,200);return r.body;};
const send=(agent,op)=>write(agent.post("/api/offline/actions")).send(op);
const op=(signature,path="/tasks",body=fields,extra={})=>({id:randomUUID(),entityId:id(),method:"POST",path,body,expectedSignature:signature,...extra});
test("integrated actions replay once and preserve original task validation",async()=>{
 const{agent}=await account(),base=await snapshot(agent),action=op(base.signature);
 const first=await send(agent,action);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.result.task._id,action.entityId);
 const repeated=await send(agent,action);assert.deepEqual(repeated.body,first.body);assert.equal(await Task.countDocuments({}),1);
 assert.equal((await send(agent,{...action,body:{...fields,title:"Different"}})).status,409);
 const invalid=op(first.body.signature,"/tasks",{...fields,title:""});assert.equal((await send(agent,invalid)).status,400);assert.equal(await Task.countDocuments({}),1);
});
test("integrated queue chains templates, recurrence, occurrence changes, and settings",async()=>{
 const{agent}=await account(),base=await snapshot(agent);
 const template=op(base.signature,"/templates",{...fields,name:"Reusable"});let r=await send(agent,template);assert.equal(r.status,200,JSON.stringify(r.body));
 const series=op(null,"/series",{...fields,allowOverlap:true,recurrence:{frequency:"daily",endDate:"2026-11-05"}},{parentId:template.id});r=await send(agent,series);assert.equal(r.status,200,JSON.stringify(r.body));
 const instance=await Task.findOne({series:series.entityId,date:"2026-11-03"});
 const occurrence=op(null,`/tasks/${id()}`,{title:"Edited offline occurrence"},{method:"PATCH",parentId:series.id,occurrence:{series:series.entityId,date:"2026-11-03"}});
 r=await send(agent,occurrence);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.result.task._id,String(instance._id));assert.equal(r.body.result.task.isException,true);
 const settings=op(null,"/account/settings",{theme:"dark"},{method:"PATCH",parentId:occurrence.id});r=await send(agent,settings);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.result.user.preferences.theme,"dark");
});
test("integrated actions refuse changed server state and cross-account replay",async()=>{
 const a=await account(),b=await account(),base=await snapshot(a.agent);
 await write(a.agent.post("/api/tasks")).send(fields);
 const action=op(base.signature);assert.equal((await send(a.agent,action)).body.error.code,"OFFLINE_CONFLICT");
 assert.equal((await send(b.agent,action)).status,409);assert.equal(await Task.countDocuments({}),1);
 assert.equal((await a.agent.post("/api/offline/actions").send(action)).status,403);
});
test("uncertain executions and online-only security actions are never replayed",async()=>{
 const{agent,user}=await account(),base=await snapshot(agent),action=op(base.signature);
 await Action.create({owner:user.id,operationId:action.id,fingerprint:createHash("sha256").update(JSON.stringify(action)).digest("hex"),state:"executing"});
 assert.equal((await send(agent,action)).status,409);assert.equal(await Task.countDocuments({}),0);
 assert.equal((await send(agent,op(base.signature,"/auth/change-password",{newPassword:"not-stored"}))).status,400);
 assert.equal((await send(agent,op(base.signature,"/account/profile",{email:"other@example.com",currentPassword:"not-stored"},{method:"PATCH"}))).status,400);
});
test("local recurrence/template/settings models preserve original UI response shapes",()=>{
 const state={snapshot:{user:{id:id(),timeZone:"Asia/Dhaka",preferences:{theme:"light"},categories:[{id:"study",name:"Study",color:"#112233"}]},tasks:[],series:[],templates:[]},queue:[]};
 const template=localNonTask(state,"/templates","POST",{...fields,name:"Reusable"},id());assert.equal(template.result.template.name,"Reusable");
 const series=localNonTask(state,"/series","POST",{...fields,recurrence:{frequency:"monthly",endDate:"2027-02-03"}},id());assert.equal(series.result.series.frequency,"monthly");
 materializeLocal(state,"2027-01-01","2027-01-31");assert.ok(state.snapshot.tasks.some(t=>t.date==="2027-01-03"));
 const settings=localNonTask(state,"/account/settings","PATCH",{theme:"dark"},id());assert.equal(settings.result.user.preferences.theme,"dark");
 assert.throws(()=>localNonTask(state,"/account/profile","PATCH",{name:"Name",email:"other@example.com"},id()));
});
