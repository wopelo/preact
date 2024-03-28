import { assign } from './util';
import { diff, commitRoot } from './diff/index';
import options from './options';
import { Fragment } from './create-element';
import { EMPTY_ARR, MODE_HYDRATE } from './constants';

/**
 * Base Component class. Provides `setState()` and `forceUpdate()`, which
 * trigger rendering
 * @param {object} props The initial component props
 * @param {object} context The initial context from parent components'
 * getChildContext
 */
export function BaseComponent(props, context) {
	this.props = props;
	this.context = context;
}

/**
 * Update component state and schedule a re-render.
 * @this {Component}
 * @param {object | ((s: object, p: object) => object)} update A hash of state
 * properties to update with new values or a function that given the current
 * state and props returns a new partial state
 * @param {() => void} [callback] A function to be called once component state is
 * updated
 */
BaseComponent.prototype.setState = function (update, callback) {
	// only clone state when copying to nextState the first time.
	let s;
	if (this._nextState != null && this._nextState !== this.state) {
		// 如果有 _nextState 且 _nextState !== state
		s = this._nextState;
	} else {
		// 如果没有 _nextState 或者 _nextState === state
		s = this._nextState = assign({}, this.state);
	}

	if (typeof update == 'function') {
		// Some libraries like `immer` mark the current state as readonly,
		// preventing us from mutating it, so we need to clone it. See #2716
		update = update(assign({}, s), this.props);

		// 用法
		// this.setState((prevState, props) => {
		//   return { count: prevState.count + 1 };
		// })
	}

	if (update) {
		assign(s, update); // assign 会影响到 s，进而影响到 _nextState
	}

	// Skip update if updater function returned null
	if (update == null) return;

	if (this._vnode) {
		// 实例的 _vnode 属性在 diff 中被设置
		if (callback) {
			// _stateCallbacks 会在 diff 中使用，diff 会将 _stateCallbacks 中的元素插入到实例的 _renderCallbacks 属性中
			this._stateCallbacks.push(callback);
		}
		enqueueRender(this);
	}
};

/**
 * Immediately perform a synchronous re-render of the component
 * @this {Component}
 * @param {() => void} [callback] A function to be called after component is
 * re-rendered
 */
BaseComponent.prototype.forceUpdate = function (callback) {
	if (this._vnode) {
		// Set render mode so that we can differentiate where the render request
		// is coming from. We need this because forceUpdate should never call
		// shouldComponentUpdate
		this._force = true;
		if (callback) this._renderCallbacks.push(callback);
		enqueueRender(this);
	}
};

/**
 * Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
 * Virtual DOM is generally constructed via [JSX](http://jasonformat.com/wtf-is-jsx).
 * @param {object} props Props (eg: JSX attributes) received from parent
 * element/component
 * @param {object} state The component's current state
 * @param {object} context Context object, as returned by the nearest
 * ancestor's `getChildContext()`
 * @returns {ComponentChildren | void}
 */
BaseComponent.prototype.render = Fragment;

/**
 * @param {VNode} vnode
 * @param {number | null} [childIndex]
 */
export function getDomSibling(vnode, childIndex) {
	if (childIndex == null) {
		// Use childIndex==null as a signal to resume the search from the vnode's sibling
		// 使用childIndex==null作为信号，从vnode的同级继续搜索，注意使用的是非严格相等
		return vnode._parent
			? getDomSibling(vnode._parent, vnode._index + 1)
			: null;
	}

	let sibling;
	for (; childIndex < vnode._children.length; childIndex++) {
		sibling = vnode._children[childIndex];

		if (sibling != null && sibling._dom != null) {
			// Since updateParentDomPointers keeps _dom pointer correct,
			// we can rely on _dom to tell us if this subtree contains a
			// rendered DOM node, and what the first rendered DOM node is
			return sibling._dom;
		}
	}

	// If we get here, we have not found a DOM node in this vnode's children.
	// We must resume from this vnode's sibling (in it's parent _children array)
	// Only climb up and search the parent if we aren't searching through a DOM
	// VNode (meaning we reached the DOM parent of the original vnode that began
	// the search)
	return typeof vnode.type == 'function' ? getDomSibling(vnode) : null;
}

/**
 * Trigger in-place re-rendering of a component. 触发组件重新渲染
 * @param {Component} component The component to rerender
 */
function renderComponent(component, commitQueue, refQueue) {
	let oldVNode = component._vnode,
		oldDom = oldVNode._dom,
		parentDom = component._parentDom;

	if (parentDom) {
		const newVNode = assign({}, oldVNode);
		newVNode._original = oldVNode._original + 1;
		if (options.vnode) options.vnode(newVNode);

		diff(
			parentDom,
			newVNode,
			oldVNode,
			component._globalContext,
			parentDom.ownerSVGElement !== undefined,
			oldVNode._flags & MODE_HYDRATE ? [oldDom] : null,
			commitQueue,
			oldDom == null ? getDomSibling(oldVNode) : oldDom,
			!!(oldVNode._flags & MODE_HYDRATE),
			refQueue
		);

		newVNode._original = oldVNode._original;
		newVNode._parent._children[newVNode._index] = newVNode;

		newVNode._nextDom = undefined;

		if (newVNode._dom != oldDom) {
			updateParentDomPointers(newVNode);
		}

		return newVNode;
	}
}

/**
 * @param {VNode} vnode
 */
function updateParentDomPointers(vnode) {
	if ((vnode = vnode._parent) != null && vnode._component != null) {
		vnode._dom = vnode._component.base = null;
		for (let i = 0; i < vnode._children.length; i++) {
			let child = vnode._children[i];
			if (child != null && child._dom != null) {
				vnode._dom = vnode._component.base = child._dom;
				break;
			}
		}

		return updateParentDomPointers(vnode);
	}
}

/**
 * The render queue
 * @type {Array<Component>}
 */
let rerenderQueue = [];

/*
 * The value of `Component.debounce` must asynchronously invoke the passed in callback. It is
 * important that contributors to Preact can consistently reason about what calls to `setState`, etc.
 * do, and when their effects will be applied. See the links below for some further reading on designing
 * asynchronous APIs.
 * * [Designing APIs for Asynchrony](https://blog.izs.me/2013/08/designing-apis-for-asynchrony)
 * * [Callbacks synchronous and asynchronous](https://blog.ometer.com/2011/07/24/callbacks-synchronous-and-asynchronous/)
 */

let prevDebounce;

// defer 最终是一个函数，默认情况下 Preact 使用 Promise.resolve() 的微任务计时。若 Promise 不可用，则使用 setTimeout。
const defer =
	typeof Promise == 'function'
		? // then 方法绑定在一个已经 resolve 的 promise 对象上
		  // 此时 defer(callback) 等同于 Promise.resolve().then(callback)
		  Promise.prototype.then.bind(Promise.resolve())
		: setTimeout;

/**
 * Enqueue a rerender of a component
 * @param {Component} c The component to rerender
 */
export function enqueueRender(c) {
	if (
		(!c._dirty &&
			(c._dirty = true) && // 标记 _dirty 为 true，表示该组件需要重新渲染
			rerenderQueue.push(c) && // 将组件加入到 rerenderQueue 渲染队列中
			!process._rerenderCount++) || // 如果是第一个加入队列的渲染任务，!process._rerenderCount++ 返回 true
		prevDebounce !== options.debounceRendering // 参考 https://preactjs.com/guide/v10/options/#optionsdebouncerendering
	) {
		// 如果没有设置 options.debounceRendering，则只有当组件未被标记为脏且是第一个加入队列的渲染任务，才会进入 if 分支
		prevDebounce = options.debounceRendering;
		(prevDebounce || defer)(process); // 通常情况下 process 会在微任务队列中执行
	}
}

/**
 * 根据组件在 VDOM Tree 中的深度进行排序，_depth 小的靠前，即越顶层组件排在越前面
 * @param {Component} a
 * @param {Component} b
 */
const depthSort = (a, b) => a._vnode._depth - b._vnode._depth;

/** Flush the render queue by rerendering all queued components */
function process() {
	let c;
	let commitQueue = [];
	let refQueue = [];
	let root;
	rerenderQueue.sort(depthSort); // rerenderQueue 被重新排序，越顶层组件排在越前面
	// Don't update `renderCount` yet. Keep its value non-zero to prevent unnecessary
	// process() calls from getting scheduled while `queue` is still being consumed.
	while ((c = rerenderQueue.shift())) {
		if (c._dirty) {
			let renderQueueLength = rerenderQueue.length;
			root = renderComponent(c, commitQueue, refQueue) || root; // 重新渲染组件
			// If this WAS the last component in the queue, run commit callbacks *before* we exit the tight loop.
			// This is required in order for `componentDidMount(){this.setState()}` to be batched into one flush.
			// Otherwise, also run commit callbacks if the render queue was mutated.
			// 两种情况会进入到 if 中：
			// 1.如果是当前队列中的最后一个组件，需要在退出循环之前执行
			// 2.由于在组件的 componentDidMount 或 componentDidUpdate 中调用了 setState（这两个方法在 diff 中被调用），导致组件渲染过程中有新组件加入到队列中
			if (renderQueueLength === 0 || rerenderQueue.length > renderQueueLength) {
				commitRoot(commitQueue, root, refQueue);
				refQueue.length = commitQueue.length = 0;
				root = undefined;
				// When i.e. rerendering a provider additional new items can be injected, we want to
				// keep the order from top to bottom with those new items so we can handle them in a
				// single pass
				rerenderQueue.sort(depthSort); // 主要针对第二种情况
			} else if (root) {
				// _commit 在 hooks/src/index.js 中定义，主要就是遍历执行 _renderCallbacks，调用 invokeCleanup 和 invokeEffect
				if (options._commit) options._commit(root, EMPTY_ARR);
			}
		}
	}
	if (root) commitRoot(commitQueue, root, refQueue);
	process._rerenderCount = 0;
}

process._rerenderCount = 0;
