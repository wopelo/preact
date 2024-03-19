import { Reducer, StateUpdater } from '.';

export { PreactContext };

export interface Options extends globalThis.Options {
	/** Attach a hook that is invoked before a vnode is diffed. */
	_diff?(vnode: VNode): void;
	diffed?(vnode: VNode): void;
	/** Attach a hook that is invoked before a vnode has rendered. */
	_render?(vnode: VNode): void;
	/** Attach a hook that is invoked after a tree was mounted or was updated. */
	_commit?(vnode: VNode, commitQueue: Component[]): void;
	_unmount?(vnode: VNode): void;
	/** Attach a hook that is invoked before a hook's state is queried. */
	_hook?(component: Component, index: number, type: HookType): void;
}

// Hook tracking

export interface ComponentHooks {
	/** The list of hooks a component uses */
	_list: HookState[];
	/** List of Effects to be invoked after the next frame is rendered */
	_pendingEffects: EffectHookState[];
}

export interface Component extends globalThis.Component<any, any> {
	__hooks?: ComponentHooks;
	// Extend to include HookStates
	_renderCallbacks?: Array<HookState | (() => void)>;
	_hasScuFromHooks?: boolean;
}

export interface VNode extends globalThis.VNode {
	_mask?: [number, number];
	_component?: Component; // Override with our specific Component type
}

export type HookState =
	| EffectHookState
	| MemoHookState
	| ReducerHookState
	| ContextHookState
	| ErrorBoundaryHookState
	| IdHookState;

/**
 * 基础钩子状态接口，定义了钩子状态的通用属性。
 * 所有特定类型的钩子状态都将扩展自这个基础接口。
 */
interface BaseHookState {
	_value?: unknown; // 当前钩子的值
	_nextValue?: undefined; // 下一个钩子的值，用于更新前的临时存储
	_pendingValue?: undefined; // 待处理的钩子值，用于异步更新场景
	_args?: undefined; // 钩子的参数列表，用于钩子的自定义行为
	_pendingArgs?: undefined; // 待处理的参数列表，用于异步更新参数
	_component?: undefined; // 关联的组件实例，用于钩子与组件的关联管理
	_cleanup?: undefined; // 清理函数，用于组件卸载时执行清理操作
}

export type Effect = () => void | Cleanup;
export type Cleanup = () => void;

export interface EffectHookState extends BaseHookState {
	_value?: Effect;
	_args?: unknown[];
	_pendingArgs?: unknown[];
	_cleanup?: Cleanup | void;
}

export interface MemoHookState<T = unknown> extends BaseHookState {
	_value?: T;
	_pendingValue?: T;
	_args?: unknown[];
	_pendingArgs?: unknown[];
	_factory?: () => T;
}

export interface ReducerHookState<S = unknown, A = unknown>
	extends BaseHookState {
	_nextValue?: [S, StateUpdater<S>];
	_value?: [S, StateUpdater<S>];
	_component?: Component;
	_reducer?: Reducer<S, A>;
}

export interface ContextHookState extends BaseHookState {
	/** Whether this hooks as subscribed to updates yet */
	_value?: boolean;
	_context?: PreactContext;
}

export interface ErrorBoundaryHookState extends BaseHookState {
	_value?: (error: unknown, errorInfo: ErrorInfo) => void;
}

export interface IdHookState extends BaseHookState {
	_value?: string;
}
