import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { DateTime } from "luxon";
import { webcrypto } from "node:crypto";
import { enqueue } from "../../client/src/offline/model.js";
import { summarize } from "../src/utils/progress.js";
import { scheduleFields } from "../src/utils/schedule.js";
import { eventType } from "../src/utils/tracking.js";
import * as domain from "../../client/src/offline/domain.js";
const fields={title:"Original dialog save",notes:"",category:"study",priority:"medium",status:"scheduled",location:"calendar",date:"2026-11-03",startTime:"09:15",endTime:"09:55"};
function client(online=false){
 let saved={version:1,snapshot:{signature:"server-version",savedAt:new Date().toISOString(),user:{id:"a".repeat(24),email:"test@example.com",timeZone:"Asia/Dhaka",preferences:{theme:"light"},categories:[{id:"study",name:"Study",color:"#123456"}]},tasks:[],templates:[],series:[]},queue:[]};
 const source=readFileSync(new URL("../../client/src/offline/integrated.js",import.meta.url),"utf8").replace(/^import .+;\n/gm,"").replace(/export (?=(?:async )?function)/g,"");
 const api=runInNewContext(source+'\n({localRequest})',{readOffline:async()=>structuredClone(saved),writeOffline:async v=>{saved=structuredClone(v);},offlineLock:async action=>action(),enqueue,summarize,DateTime,scheduleFields,eventType,...domain,crypto:webcrypto,structuredClone,URL,Date,DOMException,CustomEvent,TextEncoder,Uint8Array,navigator:{onLine:online},window:{dispatchEvent(){},addEventListener(){},setInterval(){},setTimeout(){}},document:{querySelector(){return null;}}});
 return {...api,state:()=>saved};
}
test("original API offline task create/edit/search/history/delete keeps a chained queue",async()=>{
 const c=client();let r=await c.localRequest("/tasks",{method:"POST",body:fields});assert.equal(r.handled,true);const task=r.data.task;assert.equal(task.durationMinutes,40);assert.equal(task.history.length,1);
 r=await c.localRequest(`/tasks/${task._id}`,{method:"PATCH",body:{title:"Edited",expectedUpdatedAt:task.updatedAt}});assert.equal(r.data.task.title,"Edited");
 assert.equal(c.state().queue.length,2);assert.equal(c.state().queue[1].parentId,c.state().queue[0].id);assert.equal(c.state().queue[0].path,"/tasks");
 r=await c.localRequest("/tasks/search?q=Edited");assert.equal(r.data.total,1);
 r=await c.localRequest(`/tasks/${task._id}/history?page=1`);assert.equal(r.data.total,2);
 await c.localRequest(`/tasks/${task._id}`,{method:"DELETE",body:{expectedUpdatedAt:c.state().snapshot.tasks[0].updatedAt}});
 r=await c.localRequest("/tasks?from=2026-11-03&to=2026-11-03");assert.equal(r.data.tasks.length,0);assert.ok(c.state().snapshot.tasks[0].deletedAt);
});
test("original template application and recurring dialogs work offline without a separate screen",async()=>{
 const c=client();const t=await c.localRequest("/templates",{method:"POST",body:{...fields,name:"Reusable"}});
 const applied=await c.localRequest(`/templates/${t.data.template._id}/apply`,{method:"POST",body:{location:"bucket"}});assert.equal(applied.data.task.location,"bucket");assert.equal(c.state().queue[1].path,"/tasks");
 const series=await c.localRequest("/series",{method:"POST",body:{...fields,recurrence:{frequency:"daily",endDate:"2026-11-05"},allowOverlap:true}});assert.equal(series.data.series.frequency,"daily");
 const tasks=await c.localRequest("/tasks?from=2026-11-03&to=2026-11-05");assert.equal(tasks.data.tasks.length,3);
 const occurrence=tasks.data.tasks[0];await c.localRequest(`/tasks/${occurrence._id}`,{method:"PATCH",body:{title:"Exception",expectedUpdatedAt:occurrence.updatedAt}});
 assert.equal(c.state().queue.at(-1).occurrence.series,series.data.series._id);
});
test("offline preview reflects local task edits and security secrets never enter queue",async()=>{
 const c=client();await c.localRequest("/tasks",{method:"POST",body:fields});
 const preview=await c.localRequest("/exports/preview",{method:"POST",body:{from:"2026-11-03",to:"2026-11-03",format:"pdf",period:"day"}});assert.equal(preview.data.count,1);assert.equal(preview.data.totalMinutes,40);
 const before=c.state().queue.length;
 await assert.rejects(c.localRequest("/auth/change-password",{method:"POST",body:{currentPassword:"secret",newPassword:"new-secret"}}));
 await assert.rejects(c.localRequest("/account/profile",{method:"PATCH",body:{name:"Test",email:"different@example.com",currentPassword:"secret"}}));
 assert.equal(c.state().queue.length,before);assert.ok(!JSON.stringify(c.state()).includes('"secret"'));
});
test("online planner writes also use the durable queue to avoid ambiguous duplicate creates",async()=>{
 const c=client(true);const r=await c.localRequest("/tasks",{method:"POST",body:fields});assert.equal(r.handled,true);assert.equal(c.state().queue.length,1);assert.equal(c.state().queue[0].entityId,r.data.task._id);
});
