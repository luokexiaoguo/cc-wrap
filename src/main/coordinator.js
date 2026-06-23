// Coordinator 多 Worker 模式（借鉴 Claude Code v2.1.186）

const EventEmitter = require('events');

// Worker 状态
const WorkerState = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
};

class Coordinator extends EventEmitter {
  constructor() {
    super();
    this.workers = new Map(); // workerId → worker状态
    this.workerCounter = 0;
  }

  /**
   * 启动 Worker
   * @param {object} config - Worker 配置
   * @returns {string} Worker ID
   */
  async spawnWorker(config) {
    const workerId = `worker_${++this.workerCounter}_${Date.now()}`;
    const worker = {
      id: workerId,
      ...config,
      state: WorkerState.IDLE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.workers.set(workerId, worker);
    this.emit('worker-spawned', worker);

    // 异步执行 worker
    this.executeWorker(workerId);

    return workerId;
  }

  /**
   * 执行 Worker
   */
  async executeWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    worker.state = WorkerState.RUNNING;
    worker.updatedAt = Date.now();
    this.emit('worker-started', worker);

    try {
      if (typeof worker.handler === 'function') {
        worker.result = await worker.handler(worker);
      }
      worker.state = WorkerState.COMPLETED;
      worker.updatedAt = Date.now();
      this.emit('worker-completed', worker);
    } catch (error) {
      worker.state = WorkerState.FAILED;
      worker.error = error.message;
      worker.updatedAt = Date.now();
      this.emit('worker-failed', worker);
    }
  }

  /**
   * 停止 Worker
   */
  stopWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (!worker) return false;

    worker.state = WorkerState.STOPPED;
    worker.updatedAt = Date.now();
    this.emit('worker-stopped', worker);
    return true;
  }

  /**
   * 继续 Worker（发送新消息）
   */
  async continueWorker(workerId, message) {
    const worker = this.workers.get(workerId);
    if (!worker) return false;

    // 更新 worker 配置
    if (worker.onContinue) {
      await worker.onContinue(worker, message);
    }

    // 重新执行
    this.executeWorker(workerId);
    return true;
  }

  /**
   * 获取所有 Worker
   */
  getAllWorkers() {
    return Array.from(this.workers.values());
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const workers = this.getAllWorkers();
    return {
      total: workers.length,
      idle: workers.filter(w => w.state === WorkerState.IDLE).length,
      running: workers.filter(w => w.state === WorkerState.RUNNING).length,
      completed: workers.filter(w => w.state === WorkerState.COMPLETED).length,
      failed: workers.filter(w => w.state === WorkerState.FAILED).length,
      stopped: workers.filter(w => w.state === WorkerState.STOPPED).length,
    };
  }

  /**
   * 清空所有 Worker
   */
  clear() {
    this.workers.clear();
    this.emit('workers-cleared');
  }
}

// 单例
const coordinator = new Coordinator();

module.exports = {
  Coordinator,
  WorkerState,
  coordinator,
};
