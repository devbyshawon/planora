document.getElementById("retry").addEventListener("click", () => location.reload());
function connectionStatus() {
  document.getElementById("connection").textContent = navigator.onLine
    ? "A network is available. Try again when you’re ready."
    : "You’re offline. Reconnect, then try again.";
}
window.addEventListener("online", connectionStatus);
window.addEventListener("offline", connectionStatus);
connectionStatus();
