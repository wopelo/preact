import { slice } from './util';
import options from './options';

let vnodeId = 0;

/**
 * Create an virtual node (used for JSX)
 * @param {VNode["type"]} type The node name or Component constructor for this
 * virtual node
 * @param {object | null | undefined} [props] The properties of the virtual node
 * @param {Array<import('.').ComponentChildren>} [children] The children of the
 * virtual node
 * @returns {VNode}
 */
export function createElement(type, props, children) {
	console.log('createElement', { type, props, children });
	let normalizedProps = {},
		key,
		ref,
		i;
	for (i in props) {
		if (i == 'key') key = props[i];
		else if (i == 'ref') ref = props[i];
		else normalizedProps[i] = props[i];
	}

	// 将第3个参数及其后面的参数视为子元素
	if (arguments.length > 2) {
		normalizedProps.children =
			arguments.length > 3 ? slice.call(arguments, 2) : children;
	}

	// If a Component VNode, check for and apply defaultProps
	// Note: type may be undefined in development, must never error here.
	if (typeof type == 'function' && type.defaultProps != null) {
		for (i in type.defaultProps) {
			if (normalizedProps[i] === undefined) {
				normalizedProps[i] = type.defaultProps[i];
			}
		}
	}

	return createVNode(type, normalizedProps, key, ref, null);
}

// 这里的 createVNode 是 preact 内部创建虚拟节点时使用
// 比如通过 render -> createElement -> createVNode 这条链路调用
/**
 * Create a VNode (used internally by Preact)
 * @param {VNode["type"]} type The node name or Component
 * Constructor for this virtual node
 * @param {object | string | number | null} props The properties of this virtual node.
 * If this virtual node represents a text node, this is the text of the node (string or number).
 * @param {string | number | null} key The key for this virtual node, used when
 * diffing it against its children
 * @param {VNode["ref"]} ref The ref property that will
 * receive a reference to its created child
 * @returns {VNode}
 */
export function createVNode(type, props, key, ref, original) {
	console.log('preact createVNode', { type, props, key, ref, original });
	// V8 seems to be better at detecting type shapes if the object is allocated from the same call site
	// Do not inline into createElement and coerceToVNode!
	/** @type {VNode} */
	const vnode = {
		type,
		props,
		key,
		ref,
		_children: null,
		_parent: null,
		_depth: 0,
		_dom: null,
		// _nextDom must be initialized to undefined b/c it will eventually
		// be set to dom.nextSibling which can return `null` and it is important
		// to be able to distinguish between an uninitialized _nextDom and
		// a _nextDom that has been set to `null`
		_nextDom: undefined,
		_component: null,
		constructor: undefined,
		_original: original == null ? ++vnodeId : original,
		_index: -1,
		_flags: 0
	};

	// Only invoke the vnode hook if this was *not* a direct copy:
	if (original == null && options.vnode != null) options.vnode(vnode);

	return vnode;
}

export function createRef() {
	return { current: null };
}

export function Fragment(props) {
	return props.children;
}

/**
 * Check if a the argument is a valid Preact VNode.
 * @param {*} vnode
 * @returns {vnode is VNode}
 */
export const isValidElement = vnode =>
	vnode != null && vnode.constructor == undefined;
