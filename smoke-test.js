// 冒烟测试:验证核心逻辑(非浏览器环境)
global.window = global; // 模拟浏览器:window 即全局对象
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = v; },
  removeItem(k) { delete this._d[k]; },
};
const fs = require("fs");
eval(fs.readFileSync("js/utils.js", "utf8"));
eval(fs.readFileSync("js/storage.js", "utf8"));
eval(fs.readFileSync("js/store.js", "utf8"));

const U = window.U, Store = window.Store;
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name); }
}

Store.init();
Store.addList({ name: "工作", color: "#4f46e5" });
const list = Store.getState().lists[0];
Store.addTask({ title: "写报告", listId: list.id, priority: "high", dueDate: "2099-01-01" });
Store.addTask({ title: "买菜", priority: "none" });

check("添加清单和任务", Store.getState().lists.length === 1 && Store.getState().tasks.length === 2);
check("全部视图任务数", Store.visibleTasks().length === 2);

const t = Store.getState().tasks[0];
Store.toggleTask(t.id);
check("完成任务后状态为 done", Store.getTask(t.id).status === "done");

Store.undo();
check("撤销后任务状态回退", Store.getTask(t.id).status === "todo");
Store.redo();
check("重做后任务状态恢复 done", Store.getTask(t.id).status === "done");

const p1 = U.parseNatural("明天下午3点买牛奶 #购物 @生活 !高");
check("自然语言:标题", p1.title === "买牛奶");
check("自然语言:标签", p1.tags[0] === "购物");
check("自然语言:清单名", p1.listName === "生活");
check("自然语言:优先级", p1.priority === "high");
check("自然语言:时间", p1.dueTime === "15:00");
check("自然语言:日期是明天", p1.dueDate === U.fmtDateISO(U.addDays(U.startOfToday(), 1)));

const p2 = U.parseNatural("周五交作业 !p1");
check("自然语言:周几", !!p2.dueDate && p2.title === "交作业");

Store.deleteTask(Store.getState().tasks[1].id);
check("删除任务进入回收站(软删除)", Store.getState().tasks[1].deletedAt != null);

// 批量操作
const liveIds = Store.getState().tasks.filter((t) => !t.deletedAt).map((t) => t.id);
Store.batchSetStatus(liveIds, "done");
check("批量完成", Store.getState().tasks.filter((t) => !t.deletedAt && t.status === "done").length === liveIds.length);
Store.batchSetPriority(liveIds, "low");
check("批量设优先级", Store.getState().tasks.every((t) => t.deletedAt || t.priority === "low"));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail === 0 ? 0 : 1);
