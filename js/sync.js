// ===== 同步层(纯本地模式) =====
// 本应用为纯本地:数据只存在本机浏览器,不联网、不上传、无需任何账号。
// 此模块保留接口占位,确保界面调用不报错。
window.Sync = (function () {
  function configured() { return false; }
  function sdkReady() { return false; }
  async function signUp() { throw new Error("纯本地模式,不支持账号登录"); }
  async function signIn() { throw new Error("纯本地模式,不支持账号登录"); }
  async function signOut() {}
  async function restoreSession() { return null; }
  async function syncNow() {}
  function startAutoSync() {}
  function onAuthChange() {}
  return { configured, sdkReady, signUp, signIn, signOut, restoreSession, syncNow, startAutoSync, onAuthChange };
})();
