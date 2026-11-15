/** 工作模式：全自动（Surprise Me）/ 协作（Idea） */
export type Mode = 'auto' | 'collab';

/** 提案的七个阶段（顺序固定，不含单独的"内容审核"阶段） */
export type StageId = 'brief' | 'research' | 'strategy' | 'copy' | 'visual' | 'layout' | 'final';

export interface Stage {
  id: StageId;
  index: number;
  name: string;
  /** 一句话说明这个阶段产出什么 */
  summary: string;
}

export type EventKind = 'info' | 'deliver' | 'check' | 'decision' | 'error' | 'done';

export interface ExecutionEvent {
  id: string;
  /** 排序用序号 */
  seq: number;
  /** 显示用时间（原型中为演示时钟） */
  at: string;
  stageId: StageId;
  kind: EventKind;
  text: string;
  simulated: boolean;
}

export type BotState = 'idle' | 'working' | 'waiting' | 'done' | 'blocked';

export interface BotStatus {
  state: BotState;
  label: string;
  detail: string;
}
