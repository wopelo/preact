import { EMPTY_OBJ } from './constants';
import { commitRoot, diff } from './diff/index';
import { createElement, Fragment } from './create-element';
import options from './options';
import { slice } from './util';

/**
 * Render a Preact virtual node into a DOM element
 * @param {ComponentChild} vnode The virtual node to render，即已经被编译成 preact.jsx 调用的 App 组件
 * @param {PreactElement} parentDom The DOM element to render into
 * @param {PreactElement | object} [replaceNode] Optional: Attempt to re-use an
 * existing DOM tree rooted at `replaceNode`
 */
export function render(vnode, parentDom, replaceNode) {
	console.log('render', { vnode, parentDom, replaceNode });
	if (options._root) options._root(vnode, parentDom);

	// We abuse the `replaceNode` parameter in `hydrate()` to signal if we are in
	// hydration mode or not by passing the `hydrate` function instead of a DOM
	// element..
	let isHydrating = typeof replaceNode == 'function';

	// To be able to support calling `render()` multiple times on the same
	// DOM node, we need to obtain a reference to the previous tree. We do
	// this by assigning a new `_children` property to DOM nodes which points
	// to the last rendered tree. By default this property is not present, which
	// means that we are mounting a new tree for the first time.
	let oldVNode = isHydrating
		? null
		: (replaceNode && replaceNode._children) || parentDom._children;

	// 调用 createElement -> preact.createVNode 创建一个 Fragment
	vnode = ((!isHydrating && replaceNode) || parentDom)._children =
		createElement(Fragment, null, [vnode]);

	// List of effects that need to be called after diffing.
	let commitQueue = [],
		refQueue = [];
	diff(
		parentDom,
		// Determine the new vnode tree and store it on the DOM element on
		// our custom `_children` property.
		vnode,
		oldVNode || EMPTY_OBJ,
		EMPTY_OBJ,
		parentDom.ownerSVGElement !== undefined,
		!isHydrating && replaceNode
			? [replaceNode]
			: oldVNode
			? null
			: parentDom.firstChild
			? slice.call(parentDom.childNodes)
			: null,
		// 等同于
		// let diffArgument;
		// if (!isHydrating && replaceNode) {
		//     diffArgument = [replaceNode];
		// } else if (oldVNode) {
		//     diffArgument = null;
		// } else if (parentDom.firstChild) {
		//     diffArgument = slice.call(parentDom.childNodes);
		// } else {
		//     diffArgument = null;
		// }
		// 通常客户端渲染时，该参数就是 null

		commitQueue,
		!isHydrating && replaceNode
			? replaceNode
			: oldVNode
			? oldVNode._dom
			: parentDom.firstChild,
		isHydrating,
		refQueue
	);

	vnode._nextDom = undefined;
	commitRoot(commitQueue, vnode, refQueue);
}

/**
 * Update an existing DOM element with data from a Preact virtual node
 * @param {ComponentChild} vnode The virtual node to render
 * @param {PreactElement} parentDom The DOM element to update
 */
export function hydrate(vnode, parentDom) {
	render(vnode, parentDom, hydrate);
}
