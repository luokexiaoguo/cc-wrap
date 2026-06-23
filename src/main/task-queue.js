// 3 级消息队列系统（借鉴 Claude Code 架构）
// now: 立即处理（用户消息、工具结果）
// next: 下一轮处理（计划的任务）
// later: 后台任务（定时器驱动）

const EventEmitter = require('events');

// 任务状态
const TaskState = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  BLOCKED: 'blocked',
};

// 队列类型
const QueueType = {
  NOW: 'now',       // 立即处理
  NEXT: 'next',     // 下一轮处理
  LATER: 'later',   // 后台任务
};

class TaskQueue extends EventEmitter {
  constructor() {
    super();
    this.queues = {
      [QueueType.NOW]: [],      // 立即处理队列
      [QueueType.NEXT]: [],     // 下一轮处理队列
      [QueueType.LATER]: [],    // 后台任务队列
    };
    this.processing = false;
    this.taskCounter = 0;
  }

  /**
   * 入队任务
   * @param {object} task - 任务对象
   * @param {string} queueType - 队列类型 (now/next/later)
   * @returns {string} 任务 ID
   */
  enqueue(task, queueType = QueueType.NOW) {
    const taskId = `task_${++this.taskCounter}_${Date.now()}`;
    const queuedTask = {
      id: taskId,
      ...task,
      state: TaskState.PENDING,
      queueType,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.queues[queueType].push(queuedTask);
    this.emit('task-enqueued', queuedTask);

    // 如果是 now 队列，立即触发处理
    if (queueType === QueueType.NOW) {
      this.processNext();
    }

    return taskId;
  }

  /**
   * 处理下一个任务
   */
  async processNext() {
    if (this.processing) return;
    this.processing = true;

    try {
      // 优先处理 now 队列
      while (this.queues[QueueType.NOW].length > 0) {
        const task = this.queues[QueueType.NOW].shift();
        await this.executeTask(task);
      }

      // 一次性处理 next 队列
      const nextTasks = this.queues[QueueType.NEXT].splice(0);
      for (const task of nextTasks) {
        await this.executeTask(task);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * 执行任务
   */
  async executeTask(task) {
    task.state = TaskState.RUNNING;
    task.updatedAt = Date.now();
    this.emit('task-started', task);

    try {
      if (typeof task.handler === 'function') {
        await task.handler(task);
      }
      task.state = TaskState.COMPLETED;
      task.updatedAt = Date.now();
      this.emit('task-completed', task);
    } catch (error) {
      task.state = TaskState.FAILED;
      task.error = error.message;
      task.updatedAt = Date.now();
      this.emit('task-failed', task);
    }
  }

  /**
   * 标记任务阻塞
   */
  blockTask(taskId, reason) {
    for (const queueType of Object.values(QueueType)) {
      const task = this.queues[queueType].find(t => t.id === taskId);
      if (task) {
        task.state = TaskState.BLOCKED;
        task.blockReason = reason;
        task.updatedAt = Date.now();
        this.emit('task-blocked', task);
        return true;
      }
    }
    return false;
  }

  /**
   * 获取所有任务
   */
  getAllTasks() {
    const allTasks = [];
    for (const queueType of Object.values(QueueType)) {
      allTasks.push(...this.queues[queueType]);
    }
    return allTasks;
  }

  /**
   * 获取队列统计
   */
  getStats() {
    return {
      now: this.queues[QueueType.NOW].length,
      next: this.queues[QueueType.NEXT].length,
      later: this.queues[QueueType.LATER].length,
      total: this.getAllTasks().length,
    };
  }

  /**
   * 清空队列
   */
  clear() {
    this.queues[QueueType.NOW] = [];
    this.queues[QueueType.NEXT] = [];
    this.queues[QueueType.LATER] = [];
    this.emit('queues-cleared');
  }
}

// 单例
const taskQueue = new TaskQueue();

module.exports = {
  TaskQueue,
  TaskState,
  QueueType,
  taskQueue,
};
