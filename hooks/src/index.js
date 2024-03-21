import { options as _options } from 'preact';

/** @type {number} */
let currentIndex;

/** @type {import('./internal').Component} */
let currentComponent;

/** @type {import('./internal').Component} */
let previousComponent;

/** @type {number} */
let currentHook = 0;

/** @type {Array<import('./internal').Component>} */
let afterPaintEffects = [];

let EMPTY = [];

// Cast to use internal Options type
const options = /** @type {import('./internal').Options} */ (_options);

let oldBeforeDiff = options._diff;
let oldBeforeRender = options._render;
let oldAfterDiff = options.diffed;
let oldCommit = options._commit;
let oldBeforeUnmount = options.unmount;
let oldRoot = options._root;

const RAF_TIMEOUT = 100;
let prevRaf;

/** @type {(vnode: import('./internal').VNode) => void} */
options._diff = vnode => {
	currentComponent = null;
	if (oldBeforeDiff) oldBeforeDiff(vnode);
};

options._root = (vnode, parentDom) => {
	if (vnode && parentDom._children && parentDom._children._mask) {
		vnode._mask = parentDom._children._mask;
	}

	if (oldRoot) oldRoot(vnode, parentDom);
};

/** @type {(vnode: import('./internal').VNode) => void} */
options._render = vnode => {
	// 在 diff 方法中，调用组件 render 方法前调用
	if (oldBeforeRender) oldBeforeRender(vnode);

	// currentComponent 即为组件实例，类组件直接实例化获取实例，函数组件转为类组件后实例化
	currentComponent = vnode._component;
	currentIndex = 0;

	const hooks = currentComponent.__hooks;
	if (hooks) {
		// 检查当前组件是否有 hook
		if (previousComponent === currentComponent) {
			// 可能是为了判断是否是同一个组件的连续渲染
			// 重置 hooks 的状态
			hooks._pendingEffects = [];
			currentComponent._renderCallbacks = [];
			hooks._list.forEach(hookItem => {
				if (hookItem._nextValue) {
					hookItem._value = hookItem._nextValue;
				}
				hookItem._pendingValue = EMPTY;
				hookItem._nextValue = hookItem._pendingArgs = undefined;
			});
		} else {
			// 先调用所有 pending effects 的清理函数，再执行它们
			hooks._pendingEffects.forEach(invokeCleanup);
			hooks._pendingEffects.forEach(invokeEffect);
			hooks._pendingEffects = [];
			currentIndex = 0;
		}
	}
	previousComponent = currentComponent;
};

/** @type {(vnode: import('./internal').VNode) => void} */
options.diffed = vnode => {
	if (oldAfterDiff) oldAfterDiff(vnode);

	const c = vnode._component;
	if (c && c.__hooks) {
		if (c.__hooks._pendingEffects.length) afterPaint(afterPaintEffects.push(c));
		c.__hooks._list.forEach(hookItem => {
			if (hookItem._pendingArgs) {
				hookItem._args = hookItem._pendingArgs;
			}
			if (hookItem._pendingValue !== EMPTY) {
				hookItem._value = hookItem._pendingValue;
			}
			hookItem._pendingArgs = undefined;
			hookItem._pendingValue = EMPTY;
		});
	}
	previousComponent = currentComponent = null;
};

// TODO: Improve typing of commitQueue parameter
/** @type {(vnode: import('./internal').VNode, commitQueue: any) => void} */
options._commit = (vnode, commitQueue) => {
	commitQueue.some(component => {
		try {
			component._renderCallbacks.forEach(invokeCleanup);
			component._renderCallbacks = component._renderCallbacks.filter(cb =>
				cb._value ? invokeEffect(cb) : true
			);
		} catch (e) {
			commitQueue.some(c => {
				if (c._renderCallbacks) c._renderCallbacks = [];
			});
			commitQueue = [];
			options._catchError(e, component._vnode);
		}
	});

	if (oldCommit) oldCommit(vnode, commitQueue);
};

/** @type {(vnode: import('./internal').VNode) => void} */
options.unmount = vnode => {
	if (oldBeforeUnmount) oldBeforeUnmount(vnode);

	const c = vnode._component;
	if (c && c.__hooks) {
		let hasErrored;
		c.__hooks._list.forEach(s => {
			try {
				invokeCleanup(s);
			} catch (e) {
				hasErrored = e;
			}
		});
		c.__hooks = undefined;
		if (hasErrored) options._catchError(hasErrored, c._vnode);
	}
};

/**
 * Get a hook's state from the currentComponent 从组件的 __hooks 属性中，获取当前组件指定 hook 的状态
 * @param {number} index The index of the hook to get 要获取的 hook 的索引
 * @param {number} type The index of the hook to get hook 的类型
 * @returns {any} 返回 hook 的当前状态
 */
function getHookState(index, type) {
	if (options._hook) {
		// 与判断 hook 是否在组件中使用有关
		// console.log('options._hook', options._hook)
		options._hook(currentComponent, index, currentHook || type);
	}
	currentHook = 0;

	// Largely inspired by:
	// * https://github.com/michael-klein/funcy.js/blob/f6be73468e6ec46b0ff5aa3cc4c9baf72a29025a/src/hooks/core_hooks.mjs
	// * https://github.com/michael-klein/funcy.js/blob/650beaa58c43c33a74820a3c98b3c7079cf2e333/src/renderer.mjs
	// Other implementations to look at:
	// * https://codesandbox.io/s/mnox05qp8
	const hooks =
		currentComponent.__hooks ||
		(currentComponent.__hooks = {
			_list: [],
			_pendingEffects: []
		}); // 获取或初始化组件实例的 __hooks 属性，__hooks 包含一个 _list 属性用于存储 hook，一个 _pendingEffects 属性用于存储待处理的副作用

	if (index >= hooks._list.length) {
		// 如果请求的 hook 索引超出了 _list 数组的长度，说明是新的 hook，需要在 _list 中添加
		hooks._list.push({ _pendingValue: EMPTY });
	}

	return hooks._list[index];
}

/**
 * @template {unknown} S
 * @param {import('./index').StateUpdater<S>} [initialState]
 * @returns {[S, (state: S) => void]}
 */
export function useState(initialState) {
	currentHook = 1;
	return useReducer(invokeOrReturn, initialState);
}

/**
 * @template {unknown} S
 * @template {unknown} A
 * @param {import('./index').Reducer<S, A>} reducer
 * @param {import('./index').StateUpdater<S>} initialState
 * @param {(initialState: any) => void} [init]
 * @returns {[ S, (state: S) => void ]}
 */
export function useReducer(reducer, initialState, init) {
	// reducer 形如：
	// function reducer(state, action) {
	//   if (action.type === 'incremented_age') {
	//     return {
	//       age: state.age + 1
	//     };
	//   }
	//   throw Error('Unknown action.');
	// }

	/** @type {import('./internal').ReducerHookState} */
	const hookState = getHookState(currentIndex++, 2); // 取出 hookState，首次执行时，hookState 就是 { _pendingValue: [] }

	// console.log('hookState', JSON.parse(JSON.stringify(hookState)))

	hookState._reducer = reducer; // 将 reducerHook 的 _reducer 属性设置为用户传入的 reducer 函数
	if (!hookState._component) {
		hookState._value = [
			// 给 reducerHook 添加 _value 属性，值为数组 [当前state, dispatch函数]，即 useReducer 的返回
			!init ? invokeOrReturn(undefined, initialState) : init(initialState),
			// init 是计算初始值的函数。初次渲染时，state 是 init(initialState) 或 initialState （如果没有 init 函数）

			// dispatch 函数
			action => {
				const currentValue = hookState._nextValue
					? hookState._nextValue[0]
					: hookState._value[0]; // 获取当前 state，需要判断一下 hookState._nextValue 的原因是 dispatch 可能会被反复调用
				const nextValue = hookState._reducer(currentValue, action); // 调用 reducer 函数，获取新 state

				if (currentValue !== nextValue) {
					// 通常 reducer 函数应该要返回一个新对象
					hookState._nextValue = [nextValue, hookState._value[1]]; // _nextValue 的值是 [新state, dispatch函数]
					hookState._component.setState({}); // 调用组件的 setState 方法触发更新
				}
			}
		];

		// 关联 hook 与 组件，只有在 useReducer 中，才会设置 hookState._component
		// 这样操作后，实际上 组件 和 hook 会形成双向引用，hook 的 _component 属性指向 组件，组件 的 __hooks._list 属性包含 hook
		hookState._component = currentComponent;
		// console.log('hookState', hookState)
		// console.log('currentComponent', currentComponent)

		// 在该 if 中为组件添加 shouldComponentUpdate 和 componentWillUpdate 方法
		// 如果一个组件中有多个 useReducer，_hasScuFromHooks 在第一个 useReducer 调用时，就被设为 true
		if (!currentComponent._hasScuFromHooks) {
			currentComponent._hasScuFromHooks = true;
			// prevScu 和 prevCWU 临时保存用户编写的 shouldComponentUpdate 和 componentWillUpdate
			// shouldComponentUpdate 决定组件是否应该更新，入参 nextProps、nextState，返回 true or false
			let prevScu = currentComponent.shouldComponentUpdate;
			// componentWillUpdate 在组件接收到新的 props 或 state 之前立即调用，入参 nextProps、nextState
			const prevCWU = currentComponent.componentWillUpdate;

			// If we're dealing with a forced update `shouldComponentUpdate` will
			// not be called. But we use that to update the hook values, so we
			// need to call it. 如果我们正在处理强制更新，将不会调用“shouldComponentUpdate”。但是我们使用它来更新钩子值，所以我们需要调用它。
			currentComponent.componentWillUpdate = function (p, s, c) {
				if (this._force) {
					// 类组件可以通过调用 forceUpdate 将组件 _force 属性设为 true 以强制更新
					// 此时在 diff 中会跳过调用 shouldComponentUpdate
					let tmp = prevScu;
					// Clear to avoid other sCU hooks from being called
					prevScu = undefined;
					// 为了更新 hook 的值，虽然强制更新会跳过 shouldComponentUpdate， 但还是需要执行 updateHookState，只不过暂时将 prevScu 设为 undefined
					// 这样在 updateHookState 中拿到的用户定义的 shouldComponentUpdate 方法就是 undefined
					// prevScu 影响 updateHookState 的返回，但其实 updateHookState 的返回在此时已经不重要了
					updateHookState(p, s, c);
					prevScu = tmp;
				}

				if (prevCWU) prevCWU.call(this, p, s, c);
			};

			// This SCU has the purpose of bailing out after repeated updates
			// to stateful hooks.
			// we store the next value in _nextValue[0] and keep doing that for all
			// state setters, if we have next states and
			// all next states within a component end up being equal to their original state
			// we are safe to bail out for this specific component.
			/**
			 *
			 * @type {import('./internal').Component["shouldComponentUpdate"]}
			 */
			// updateHookState 作为 shouldComponentUpdate
			// 当用户有定义 shouldComponentUpdate 时，以用户的 shouldComponentUpdate 返回为准
			// 当用户没有定义 shouldComponentUpdate 时，则判断组件的 stateHooks 中有无 state 发生更新，有则返回 true
			// @ts-ignore - We don't use TS to downtranspile
			// eslint-disable-next-line no-inner-declarations
			function updateHookState(p, s, c) {
				// p - nextProps, s - nextState, c - context
				if (!hookState._component.__hooks) return true; // 如果组件没有 hooks，则直接返回 true，表示需要更新

				/** @type {(x: import('./internal').HookState) => x is import('./internal').ReducerHookState} */
				// 过滤出所有的 state hooks，包括 useState 和 useReducer，只有这两个 hook 才有 _component 属性
				const isStateHook = x => !!x._component;
				const stateHooks =
					hookState._component.__hooks._list.filter(isStateHook);

				// 判断所有的 state hooks 是否都没有 _nextValue，即都没有新的 state
				// _nextValue 在 dispatch 函数中被赋为最新值
				const allHooksEmpty = stateHooks.every(x => !x._nextValue);
				// When we have no updated hooks in the component we invoke the previous SCU or
				// traverse the VDOM tree further. 当在组件中没有更新的挂钩时，会调用以前的SCU或进一步遍历VDOM树。
				// 如果所有的 state hooks 都没有新的 state，则调用原来的 shouldComponentUpdate 方法，或者返回 true
				if (allHooksEmpty) {
					return prevScu ? prevScu.call(this, p, s, c) : true;
				}

				// We check whether we have components with a nextValue set that
				// have values that aren't equal to one another this pushes
				// us to update further down the tree
				// 判断是否有 state hooks 的新的 state 和旧的 state 不相等。如果有，则表示需要更新
				let shouldUpdate = false;
				stateHooks.forEach(hookItem => {
					if (hookItem._nextValue) {
						const currentValue = hookItem._value[0]; // 当前 state
						hookItem._value = hookItem._nextValue; // 更新 state
						hookItem._nextValue = undefined;
						if (currentValue !== hookItem._value[0]) shouldUpdate = true; // 更新前后 state 不相同，则需要更新
					}
				});

				return shouldUpdate || hookState._component.props !== p // 前后 state 不一样，或者 props 发生变化
					? prevScu
						? prevScu.call(this, p, s, c) // 用户自己写了 shouldComponentUpdate，则返回 shouldComponentUpdate 的返回值
						: true
					: false;
			}

			currentComponent.shouldComponentUpdate = updateHookState;

			// 这里类组件和函数组件都会被添加 shouldComponentUpdate、componentWillUpdate
			// 两个方法在 diff 中调用 options._render之前执行，shouldComponentUpdate 先执行
		}
	}

	return hookState._nextValue || hookState._value;
}

/**
 * @param {import('./internal').Effect} callback
 * @param {unknown[]} args
 * @returns {void}
 */
export function useEffect(callback, args) {
	/** @type {import('./internal').EffectHookState} */
	const state = getHookState(currentIndex++, 3);
	if (!options._skipEffects && argsChanged(state._args, args)) {
		state._value = callback;
		state._pendingArgs = args;

		currentComponent.__hooks._pendingEffects.push(state);
	}
}

/**
 * @param {import('./internal').Effect} callback
 * @param {unknown[]} args
 * @returns {void}
 */
export function useLayoutEffect(callback, args) {
	/** @type {import('./internal').EffectHookState} */
	const state = getHookState(currentIndex++, 4);
	if (!options._skipEffects && argsChanged(state._args, args)) {
		state._value = callback;
		state._pendingArgs = args;

		currentComponent._renderCallbacks.push(state);
	}
}

/** @type {(initialValue: unknown) => unknown} */
export function useRef(initialValue) {
	currentHook = 5;
	return useMemo(() => ({ current: initialValue }), []);
}

/**
 * @param {object} ref
 * @param {() => object} createHandle
 * @param {unknown[]} args
 * @returns {void}
 */
export function useImperativeHandle(ref, createHandle, args) {
	currentHook = 6;
	useLayoutEffect(
		() => {
			if (typeof ref == 'function') {
				ref(createHandle());
				return () => ref(null);
			} else if (ref) {
				ref.current = createHandle();
				return () => (ref.current = null);
			}
		},
		args == null ? args : args.concat(ref)
	);
}

/**
 * @template {unknown} T
 * @param {() => T} factory
 * @param {unknown[]} args
 * @returns {T}
 */
export function useMemo(factory, args) {
	/** @type {import('./internal').MemoHookState<T>} */
	const state = getHookState(currentIndex++, 7);
	if (argsChanged(state._args, args)) {
		state._pendingValue = factory();
		state._pendingArgs = args;
		state._factory = factory;
		return state._pendingValue;
	}

	return state._value;
}

/**
 * @param {() => void} callback
 * @param {unknown[]} args
 * @returns {() => void}
 */
export function useCallback(callback, args) {
	currentHook = 8;
	return useMemo(() => callback, args);
}

/**
 * @param {import('./internal').PreactContext} context
 */
export function useContext(context) {
	const provider = currentComponent.context[context._id];
	// We could skip this call here, but than we'd not call
	// `options._hook`. We need to do that in order to make
	// the devtools aware of this hook.
	/** @type {import('./internal').ContextHookState} */
	const state = getHookState(currentIndex++, 9);
	// The devtools needs access to the context object to
	// be able to pull of the default value when no provider
	// is present in the tree.
	state._context = context;
	if (!provider) return context._defaultValue;
	// This is probably not safe to convert to "!"
	if (state._value == null) {
		state._value = true;
		provider.sub(currentComponent);
	}
	return provider.props.value;
}

/**
 * Display a custom label for a custom hook for the devtools panel
 * @type {<T>(value: T, cb?: (value: T) => string | number) => void}
 */
export function useDebugValue(value, formatter) {
	if (options.useDebugValue) {
		options.useDebugValue(
			formatter ? formatter(value) : /** @type {any}*/ (value)
		);
	}
}

/**
 * @param {(error: unknown, errorInfo: import('preact').ErrorInfo) => void} cb
 * @returns {[unknown, () => void]}
 */
export function useErrorBoundary(cb) {
	/** @type {import('./internal').ErrorBoundaryHookState} */
	const state = getHookState(currentIndex++, 10);
	const errState = useState();
	state._value = cb;
	if (!currentComponent.componentDidCatch) {
		currentComponent.componentDidCatch = (err, errorInfo) => {
			if (state._value) state._value(err, errorInfo);
			errState[1](err);
		};
	}
	return [
		errState[0],
		() => {
			errState[1](undefined);
		}
	];
}

/** @type {() => string} */
export function useId() {
	/** @type {import('./internal').IdHookState} */
	const state = getHookState(currentIndex++, 11);
	if (!state._value) {
		// Grab either the root node or the nearest async boundary node.
		/** @type {import('./internal.d').VNode} */
		let root = currentComponent._vnode;
		while (root !== null && !root._mask && root._parent !== null) {
			root = root._parent;
		}

		let mask = root._mask || (root._mask = [0, 0]);
		state._value = 'P' + mask[0] + '-' + mask[1]++;
	}

	return state._value;
}

/**
 * After paint effects consumer.
 */
function flushAfterPaintEffects() {
	let component;
	while ((component = afterPaintEffects.shift())) {
		if (!component._parentDom || !component.__hooks) continue;
		try {
			component.__hooks._pendingEffects.forEach(invokeCleanup);
			component.__hooks._pendingEffects.forEach(invokeEffect);
			component.__hooks._pendingEffects = [];
		} catch (e) {
			component.__hooks._pendingEffects = [];
			options._catchError(e, component._vnode);
		}
	}
}

let HAS_RAF = typeof requestAnimationFrame == 'function';

/**
 * Schedule a callback to be invoked after the browser has a chance to paint a new frame.
 * Do this by combining requestAnimationFrame (rAF) + setTimeout to invoke a callback after
 * the next browser frame.
 *
 * Also, schedule a timeout in parallel to the the rAF to ensure the callback is invoked
 * even if RAF doesn't fire (for example if the browser tab is not visible)
 *
 * @param {() => void} callback
 */
function afterNextFrame(callback) {
	const done = () => {
		clearTimeout(timeout);
		if (HAS_RAF) cancelAnimationFrame(raf);
		setTimeout(callback);
	};
	const timeout = setTimeout(done, RAF_TIMEOUT);

	let raf;
	if (HAS_RAF) {
		raf = requestAnimationFrame(done);
	}
}

// Note: if someone used options.debounceRendering = requestAnimationFrame,
// then effects will ALWAYS run on the NEXT frame instead of the current one, incurring a ~16ms delay.
// Perhaps this is not such a big deal.
/**
 * Schedule afterPaintEffects flush after the browser paints
 * @param {number} newQueueLength
 * @returns {void}
 */
function afterPaint(newQueueLength) {
	if (newQueueLength === 1 || prevRaf !== options.requestAnimationFrame) {
		prevRaf = options.requestAnimationFrame;
		(prevRaf || afterNextFrame)(flushAfterPaintEffects);
	}
}

/**
 * 调用并清理给定的 Hook 的清理函数
 * @param {import('./internal').HookState} hook
 * @returns {void}
 */
function invokeCleanup(hook) {
	// A hook cleanup can introduce a call to render which creates a new root, this will call options.vnode
	// and move the currentComponent away.
	// 保存当前组件的引用，因为清理函数可能会触发渲染操作，导致 currentComponent 改变
	const comp = currentComponent;
	let cleanup = hook._cleanup; // 获取 Hook 的清理函数
	if (typeof cleanup == 'function') {
		// 如果存在清理函数，则执行它并重置 Hook 的清理函数
		hook._cleanup = undefined;
		cleanup();
	}

	currentComponent = comp; // 恢复 currentComponent 的引用
}

/**
 * Invoke a Hook's effect 调用一个 Hook 的 effect
 * @param {import('./internal').EffectHookState} hook
 * @returns {void}
 */
function invokeEffect(hook) {
	// A hook call can introduce a call to render which creates a new root, this will call options.vnode
	// and move the currentComponent away.
	// 保存当前组件的引用，因为 Hook 的调用可能会触发渲染操作，导致 currentComponent 改变
	const comp = currentComponent;
	hook._cleanup = hook._value(); // 调用 Hook 的 effect，并将返回的清理函数保存到 Hook 的 _cleanup 属性中
	currentComponent = comp; // 恢复 currentComponent 的引用
}

/**
 * @param {unknown[]} oldArgs
 * @param {unknown[]} newArgs
 * @returns {boolean}
 */
function argsChanged(oldArgs, newArgs) {
	return (
		!oldArgs ||
		oldArgs.length !== newArgs.length ||
		newArgs.some((arg, index) => arg !== oldArgs[index])
	);
}

/**
 * 判断参数f是否为函数，如果是函数则将 arg 传入函数并返回执行结果，否则直接返回f
 * @param {any} arg - 传入函数f的参数
 * @param {function|any} f - 可能是一个函数，也可能是任何类型的值
 * @return {any} - 返回函数f执行的结果或者直接返回f
 */
function invokeOrReturn(arg, f) {
	return typeof f == 'function' ? f(arg) : f;
}
