const mime = "application/x-planora-task";
export function startTaskDrag(event, task) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(mime, task._id);
}
export function acceptTaskDrag(event) {
  if (Array.from(event.dataTransfer.types || []).includes(mime)) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    return true;
  }
  return false;
}
export function droppedTask(event) {
  if (!Array.from(event.dataTransfer.types || []).includes(mime)) return null;
  event.preventDefault();
  const id = event.dataTransfer.getData(mime);
  return /^[a-f0-9]{24}$/i.test(id) ? id : null;
}
