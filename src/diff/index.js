import {
	EMPTY_OBJ,
	MODE_HYDRATE,
	MODE_SUSPENDED,
	RESET_MODE
} from '../constants';
import { BaseComponent, getDomSibling } from '../component';
import { Fragment } from '../create-element';
import { diffChildren } from './children';
import { setProperty } from './props';
import { assign, isArray, removeNode, slice } from '../util';
import options from '../options';

/**
 * Diff two virtual nodes and apply proper changes to the DOM
 * diff 两个VNode，并将更改应用到DOM上
 * @param {PreactElement} parentDom The parent of the DOM element
 * @param {VNode} newVNode The new virtual node
 * @param {VNode} oldVNode The old virtual node
 * @param {object} globalContext The current context object. Modified by
 * getChildContext
 * @param {boolean} isSvg Whether or not this element is an SVG node
 * @param {Array<PreactElement>} excessDomChildren
 * @param {Array<Component>} commitQueue List of components which have callbacks
 * to invoke in commitRoot
 * @param {PreactElement} oldDom The current attached DOM element any new dom
 * elements should be placed around. Likely `null` on first render (except when
 * hydrating). Can be a sibling DOM element when diffing Fragments that have
 * siblings. In most cases, it starts out as `oldChildren[0]._dom`.
 * @param {boolean} isHydrating Whether or not we are in hydration
 * @param {any[]} refQueue an array of elements needed to invoke refs
 */
export function diff(
	parentDom,
	newVNode,
	oldVNode,
	globalContext,
	isSvg,
	excessDomChildren,
	commitQueue,
	oldDom,
	isHydrating,
	refQueue
) {
	console.log('diffdiff', {
		parentDom,
		newVNode,
		oldVNode,
		globalContext,
		isSvg,
		excessDomChildren,
		commitQueue,
		oldDom,
		isHydrating,
		refQueue
	});

	/** @type {any} */
	let tmp,
		newType = newVNode.type;

	// When passing through createElement it assigns the object
	// constructor as undefined. This to prevent JSON-injection.
	if (newVNode.constructor !== undefined) return null;

	// & 是按位与运算符，比如 a & b，的意思是将 a 和 b 的二进制表示进行按位与运算
	// 该 if 语句用于判断 vnode.flags 是否包含 MODE_HYDRATE
	// If the previous diff bailed out, resume creating/hydrating.
	if (oldVNode._flags & MODE_SUSPENDED) {
		isHydrating = !!(oldVNode._flags & MODE_HYDRATE);
		oldDom = newVNode._dom = oldVNode._dom;
		excessDomChildren = [oldDom];
	}

	// console.log('options', options);

	if ((tmp = options._diff)) tmp(newVNode);

	outer: if (typeof newType == 'function') {
		// 类组件和函数组件都会走到这里
		try {
			let c, isNew, oldProps, oldState, snapshot, clearProcessingException;
			let newProps = newVNode.props;

			// 这三行代码与 context 有关
			// Necessary for createContext api. Setting this property will pass
			// the context value as `this.context` just for this component.
			tmp = newType.contextType; // 类组件读取context https://zh-hans.react.dev/reference/react/Component#static-contexttype
			let provider = tmp && globalContext[tmp._id];
			let componentContext = tmp
				? provider
					? provider.props.value
					: tmp._defaultValue
				: globalContext;

			// Get component and set it to `c`
			if (oldVNode._component) {
				// oldVNode 已经实例化了
				c = newVNode._component = oldVNode._component;
				clearProcessingException = c._processingException = c._pendingError;
			} else {
				// oldVNode 没有实例化
				// Instantiate the new component
				if ('prototype' in newType && newType.prototype.render) {
					// 如果是类组件，则实例化组件之后即得到组件实例
					// @ts-expect-error The check above verifies that newType is suppose to be constructed
					newVNode._component = c = new newType(newProps, componentContext); // eslint-disable-line new-cap
				} else {
					// 如果是函数组件，转换为类组件
					// @ts-expect-error Trust me, Component implements the interface we want
					newVNode._component = c = new BaseComponent( // BaseComponent 就是把 props 和 context 绑定到 this 上
						newProps,
						componentContext
					);
					c.constructor = newType; // 类组件的构造函数就是函数组件本身
					c.render = doRender; // doRender 用于渲染函数组件，doRender 返回执行 c.constructor 的结果，即返回函数组件执行结果
				}
				if (provider) provider.sub(c);

				c.props = newProps;
				if (!c.state) c.state = {};
				c.context = componentContext;
				c._globalContext = globalContext;
				isNew = c._dirty = true;
				// 渲染完成后调用的函数，包括 componentDidMount、setState 的 callback、componentDidUpdate
				c._renderCallbacks = [];
				c._stateCallbacks = []; // _stateCallbacks 初始化
			}

			// Invoke getDerivedStateFromProps
			if (c._nextState == null) {
				// _nextState 初始化
				c._nextState = c.state;
			}

			// 类组件可以设置静态方法 getDerivedStateFromProps，参考 https://zh-hans.react.dev/reference/react/Component#static-getderivedstatefromprops
			if (newType.getDerivedStateFromProps != null) {
				if (c._nextState == c.state) {
					c._nextState = assign({}, c._nextState);
				}

				assign(
					c._nextState,
					newType.getDerivedStateFromProps(newProps, c._nextState)
				);
			}

			oldProps = c.props;
			oldState = c.state;
			c._vnode = newVNode;

			// Invoke pre-render lifecycle methods 调用渲染前生命周期方法，比如 componentWillMount
			if (isNew) {
				// 如果 oldNode 没有实例化，isNew会在前面设为 true
				if (
					newType.getDerivedStateFromProps == null &&
					c.componentWillMount != null
				) {
					c.componentWillMount();
				}

				if (c.componentDidMount != null) {
					c._renderCallbacks.push(c.componentDidMount);
				}
			} else {
				if (
					newType.getDerivedStateFromProps == null &&
					newProps !== oldProps &&
					c.componentWillReceiveProps != null
				) {
					// 类组件可以定义 componentWillReceiveProps 方法，参考 https://zh-hans.react.dev/reference/react/Component#unsafe_componentwillreceiveprops
					c.componentWillReceiveProps(newProps, componentContext);
				}

				// 在类组件可以通过调用 this.forceUpdate 将组件 _force 属性设为 ture，以跳过 shouldComponentUpdate 强制更新
				if (
					!c._force &&
					((c.shouldComponentUpdate != null &&
						c.shouldComponentUpdate(
							newProps,
							c._nextState,
							componentContext
						) === false) ||
						newVNode._original === oldVNode._original)
				) {
					// More info about this here: https://gist.github.com/JoviDeCroock/bec5f2ce93544d2e6070ef8e0036e4e8
					if (newVNode._original !== oldVNode._original) {
						// When we are dealing with a bail because of sCU we have to update
						// the props, state and dirty-state.
						// when we are dealing with strict-equality we don't as the child could still
						// be dirtied see #3883
						c.props = newProps;
						c.state = c._nextState;
						c._dirty = false;
					}

					newVNode._dom = oldVNode._dom;
					newVNode._children = oldVNode._children;
					newVNode._children.forEach(vnode => {
						if (vnode) vnode._parent = newVNode;
					});

					for (let i = 0; i < c._stateCallbacks.length; i++) {
						c._renderCallbacks.push(c._stateCallbacks[i]);
					}
					c._stateCallbacks = [];

					if (c._renderCallbacks.length) {
						commitQueue.push(c);
					}

					break outer;
				}

				if (c.componentWillUpdate != null) {
					c.componentWillUpdate(newProps, c._nextState, componentContext);
				}

				if (c.componentDidUpdate != null) {
					c._renderCallbacks.push(() => {
						c.componentDidUpdate(oldProps, oldState, snapshot);
					});
				}
			}

			c.context = componentContext;
			c.props = newProps;
			c._parentDom = parentDom; // 设置实例的 _parentDom
			c._force = false;

			let renderHook = options._render,
				count = 0;
			if ('prototype' in newType && newType.prototype.render) {
				// 类组件走这里
				c.state = c._nextState;
				c._dirty = false;

				if (renderHook) renderHook(newVNode);

				tmp = c.render(c.props, c.state, c.context);

				for (let i = 0; i < c._stateCallbacks.length; i++) {
					c._renderCallbacks.push(c._stateCallbacks[i]);
				}
				c._stateCallbacks = [];
			} else {
				// 函数组件走这里
				do {
					c._dirty = false;
					if (renderHook) renderHook(newVNode);

					tmp = c.render(c.props, c.state, c.context); // tmp 就是函数组件执行的结果

					// console.log('tmp', tmp);

					// Handle setState called in render, see #2553
					c.state = c._nextState;
				} while (c._dirty && ++count < 25);
			}

			// Handle setState called in render, see #2553
			c.state = c._nextState;

			// 类组件可以定义 getChildContext 方法，参考 https://zh-hans.react.dev/reference/react/Component#getchildcontext
			if (c.getChildContext != null) {
				globalContext = assign(assign({}, globalContext), c.getChildContext());
			}

			// 类组件可以定义 getSnapshotBeforeUpdategetSnapshotBeforeUpdate 方法，参考 https://zh-hans.react.dev/reference/react/Component#getsnapshotbeforeupdate
			if (!isNew && c.getSnapshotBeforeUpdate != null) {
				snapshot = c.getSnapshotBeforeUpdate(oldProps, oldState);
			}

			let isTopLevelFragment =
				tmp != null && tmp.type === Fragment && tmp.key == null;
			// 获取渲染结果，如果是一个没有 key 的 Fragment，则获取它的子元素，否则渲染结果就是组件执行结果
			let renderResult = isTopLevelFragment ? tmp.props.children : tmp;

			diffChildren(
				parentDom,
				isArray(renderResult) ? renderResult : [renderResult],
				newVNode,
				oldVNode,
				globalContext,
				isSvg,
				excessDomChildren,
				commitQueue,
				oldDom,
				isHydrating,
				refQueue
			);

			c.base = newVNode._dom;

			// We successfully rendered this VNode, unset any stored hydration/bailout state:
			newVNode._flags &= RESET_MODE;

			if (c._renderCallbacks.length) {
				commitQueue.push(c);
			}

			if (clearProcessingException) {
				c._pendingError = c._processingException = null;
			}
		} catch (e) {
			newVNode._original = null;
			// if hydrating or creating initial tree, bailout preserves DOM:
			if (isHydrating || excessDomChildren != null) {
				newVNode._dom = oldDom;
				newVNode._flags |= isHydrating
					? MODE_HYDRATE | MODE_SUSPENDED
					: MODE_HYDRATE;
				excessDomChildren[excessDomChildren.indexOf(oldDom)] = null;
				// ^ could possibly be simplified to:
				// excessDomChildren.length = 0;
			} else {
				newVNode._dom = oldVNode._dom;
				newVNode._children = oldVNode._children;
			}
			options._catchError(e, newVNode, oldVNode);
		}
	} else if (
		excessDomChildren == null &&
		newVNode._original === oldVNode._original
	) {
		newVNode._children = oldVNode._children;
		newVNode._dom = oldVNode._dom;
	} else {
		// type 为标签名（至少首次渲染会走到这里）
		newVNode._dom = diffElementNodes(
			oldVNode._dom,
			newVNode,
			oldVNode,
			globalContext,
			isSvg,
			excessDomChildren,
			commitQueue,
			isHydrating,
			refQueue
		);
	}

	if ((tmp = options.diffed)) tmp(newVNode);
}

/**
 * commitRoot 函数用于在组件更新过程的最后阶段，执行组件的回调函数，并处理组件的 ref。
 * @param {Array<Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {VNode} root
 */
export function commitRoot(commitQueue, root, refQueue) {
	// console.log('commitRoot', { commitQueue, root, refQueue })
	for (let i = 0; i < refQueue.length; i++) {
		applyRef(refQueue[i], refQueue[++i], refQueue[++i]);
	}

	// options._commit 定义在 hooks/src/index.js 中
	// 主要功能是执行组件的 renderCallbacks，调用 invokeCleanup 和 invokeEffect
	if (options._commit) options._commit(root, commitQueue);

	commitQueue.some(c => {
		try {
			// @ts-expect-error Reuse the commitQueue variable here so the type changes
			commitQueue = c._renderCallbacks;
			c._renderCallbacks = [];
			commitQueue.some(cb => {
				// @ts-expect-error See above comment on commitQueue
				cb.call(c);
				// 执行 _renderCallbacks，组件的 componentDidMount、componentDidUpdate 生命周期，setState 的 callback 在此时执行
			});
		} catch (e) {
			options._catchError(e, c._vnode);
		}
	});
}

/**
 * Diff two virtual nodes representing DOM element diff两个代表DOM元素的虚拟节点
 * @param {PreactElement} dom The DOM element representing the virtual nodes
 * being diffed 正在对比的虚拟节点的DOM元素，新旧VNode 共享同一个 DOM 元素
 * @param {VNode} newVNode The new virtual node
 * @param {VNode} oldVNode The old virtual node
 * @param {object} globalContext The current context object
 * @param {boolean} isSvg Whether or not this DOM node is an SVG node
 * @param {Array<PreactElement>} excessDomChildren
 * @param {Array<Component>} commitQueue List of components which have callbacks
 * to invoke in commitRoot
 * @param {boolean} isHydrating Whether or not we are in hydration
 * @param {any[]} refQueue an array of elements needed to invoke refs
 * @returns {PreactElement}
 */
function diffElementNodes(
	dom,
	newVNode,
	oldVNode,
	globalContext,
	isSvg,
	excessDomChildren,
	commitQueue,
	isHydrating,
	refQueue
) {
	console.log('diffElementNodes', {
		dom,
		newVNode,
		oldVNode
	});

	let oldProps = oldVNode.props;
	let newProps = newVNode.props;
	let nodeType = /** @type {string} */ (newVNode.type);
	/** @type {any} */
	let i;
	/** @type {{ __html?: string }} */
	let newHtml;
	/** @type {{ __html?: string }} */
	let oldHtml;
	/** @type {ComponentChildren} */
	let newChildren;
	let value;
	let inputValue;
	let checked;

	// Tracks entering and exiting SVG namespace when descending through the tree.
	if (nodeType === 'svg') isSvg = true;

	if (excessDomChildren != null) {
		for (i = 0; i < excessDomChildren.length; i++) {
			value = excessDomChildren[i];

			// if newVNode matches an element in excessDomChildren or the `dom`
			// argument matches an element in excessDomChildren, remove it from
			// excessDomChildren so it isn't later removed in diffChildren
			if (
				value &&
				'setAttribute' in value === !!nodeType &&
				(nodeType ? value.localName === nodeType : value.nodeType === 3)
			) {
				dom = value;
				excessDomChildren[i] = null;
				break;
			}
		}
	}

	if (dom == null) {
		// 如果还没有创建 DOM 元素，根据 newVNode.type 创建 DOM
		if (nodeType === null) {
			// 创建文本元素
			return document.createTextNode(newProps);
		}

		if (isSvg) {
			// 创建 SVG
			dom = document.createElementNS('http://www.w3.org/2000/svg', nodeType);
		} else {
			// 创建其他 DOM 元素，第二个参数与创建自定义元素有关
			dom = document.createElement(nodeType, newProps.is && newProps);
		}

		// we created a new parent, so none of the previously attached children can be reused:
		excessDomChildren = null;
		// we are creating a new node, so we can assume this is a new subtree (in
		// case we are hydrating), this deopts the hydrate
		isHydrating = false;
	}

	if (nodeType === null) {
		// During hydration, we still have to split merged text from SSR'd HTML.
		if (oldProps !== newProps && (!isHydrating || dom.data !== newProps)) {
			dom.data = newProps;
		}
	} else {
		// If excessDomChildren was not null, repopulate it with the current element's children:
		excessDomChildren = excessDomChildren && slice.call(dom.childNodes);

		oldProps = oldVNode.props || EMPTY_OBJ;

		// If we are in a situation where we are not hydrating but are using
		// existing DOM (e.g. replaceNode) we should read the existing DOM
		// attributes to diff them
		if (!isHydrating && excessDomChildren != null) {
			oldProps = {};
			for (i = 0; i < dom.attributes.length; i++) {
				value = dom.attributes[i];
				oldProps[value.name] = value.value;
			}
		}

		for (i in oldProps) {
			value = oldProps[i];
			if (i == 'children') {
			} else if (i == 'dangerouslySetInnerHTML') {
				oldHtml = value;
			} else if (i !== 'key' && !(i in newProps)) {
				// 移除 newProps 中不存在的属性
				setProperty(dom, i, null, value, isSvg);
			}
		}

		// During hydration, props are not diffed at all (including dangerouslySetInnerHTML)
		// @TODO we should warn in debug mode when props don't match here.
		for (i in newProps) {
			value = newProps[i];
			if (i == 'children') {
				newChildren = value;
			} else if (i == 'dangerouslySetInnerHTML') {
				newHtml = value;
			} else if (i == 'value') {
				inputValue = value;
			} else if (i == 'checked') {
				checked = value;
			} else if (
				i !== 'key' &&
				(!isHydrating || typeof value == 'function') &&
				oldProps[i] !== value
			) {
				setProperty(dom, i, value, oldProps[i], isSvg); // 更新属性
			}
		}

		// If the new vnode didn't have dangerouslySetInnerHTML, diff its children
		if (newHtml) {
			// Avoid re-applying the same '__html' if it did not changed between re-render
			if (
				!isHydrating &&
				(!oldHtml ||
					(newHtml.__html !== oldHtml.__html &&
						newHtml.__html !== dom.innerHTML))
			) {
				dom.innerHTML = newHtml.__html;
			}

			newVNode._children = [];
		} else {
			if (oldHtml) dom.innerHTML = '';

			diffChildren(
				dom,
				isArray(newChildren) ? newChildren : [newChildren],
				newVNode,
				oldVNode,
				globalContext,
				isSvg && nodeType !== 'foreignObject',
				excessDomChildren,
				commitQueue,
				excessDomChildren
					? excessDomChildren[0]
					: oldVNode._children && getDomSibling(oldVNode, 0),
				isHydrating,
				refQueue
			);

			// Remove children that are not part of any vnode.
			if (excessDomChildren != null) {
				for (i = excessDomChildren.length; i--; ) {
					if (excessDomChildren[i] != null) removeNode(excessDomChildren[i]);
				}
			}
		}

		// As above, don't diff props during hydration
		if (!isHydrating) {
			i = 'value';
			if (
				inputValue !== undefined &&
				// #2756 For the <progress>-element the initial value is 0,
				// despite the attribute not being present. When the attribute
				// is missing the progress bar is treated as indeterminate.
				// To fix that we'll always update it when it is 0 for progress elements
				(inputValue !== dom[i] ||
					(nodeType === 'progress' && !inputValue) ||
					// This is only for IE 11 to fix <select> value not being updated.
					// To avoid a stale select value we need to set the option.value
					// again, which triggers IE11 to re-evaluate the select value
					(nodeType === 'option' && inputValue !== oldProps[i]))
			) {
				setProperty(dom, i, inputValue, oldProps[i], false);
			}

			i = 'checked';
			if (checked !== undefined && checked !== dom[i]) {
				setProperty(dom, i, checked, oldProps[i], false);
			}
		}
	}

	return dom;
}

/**
 * Invoke or update a ref, depending on whether it is a function or object ref.
 * @param {Ref<any>} ref
 * @param {any} value
 * @param {VNode} vnode
 */
export function applyRef(ref, value, vnode) {
	try {
		if (typeof ref == 'function') ref(value);
		else ref.current = value;
	} catch (e) {
		options._catchError(e, vnode);
	}
}

/**
 * Unmount a virtual node from the tree and apply DOM changes 从树中卸载VNode，并应用到DOM上
 * @param {VNode} vnode The virtual node to unmount
 * @param {VNode} parentVNode The parent of the VNode that initiated the unmount
 * @param {boolean} [skipRemove] Flag that indicates that a parent node of the
 * current element is already detached from the DOM.
 */
export function unmount(vnode, parentVNode, skipRemove) {
	let r;
	if (options.unmount) options.unmount(vnode);

	if ((r = vnode.ref)) {
		if (!r.current || r.current === vnode._dom) {
			applyRef(r, null, parentVNode);
		}
	}

	if ((r = vnode._component) != null) {
		// 执行类函数的 componentWillUnmount 方法
		if (r.componentWillUnmount) {
			try {
				r.componentWillUnmount();
			} catch (e) {
				options._catchError(e, parentVNode);
			}
		}

		r.base = r._parentDom = null;
		vnode._component = undefined;
	}

	if ((r = vnode._children)) {
		for (let i = 0; i < r.length; i++) {
			// 卸载子节点
			if (r[i]) {
				unmount(
					r[i],
					parentVNode,
					skipRemove || typeof vnode.type !== 'function'
				);
			}
		}
	}

	if (!skipRemove && vnode._dom != null) {
		removeNode(vnode._dom); // 在真实的DOM中移除该节点
	}

	// Must be set to `undefined` to properly clean up `_nextDom`
	// for which `null` is a valid value. See comment in `create-element.js`
	vnode._parent = vnode._dom = vnode._nextDom = undefined;
}

// 函数组件的 render 方法
/** The `.render()` method for a PFC backing instance. */
function doRender(props, state, context) {
	return this.constructor(props, context);
}
