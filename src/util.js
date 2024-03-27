import { EMPTY_ARR } from './constants';

export const isArray = Array.isArray;

/**
 * Assign properties from `props` to `obj` 将 `props` 对象中的属性复制到 `obj` 对象中
 * @template O, P The obj and props types
 * @param {O} obj The object to copy properties to
 * @param {P} props The object to copy properties from
 * @returns {O & P}
 */
export function assign(obj, props) {
	// @ts-expect-error We change the type of `obj` to be `O & P`
	for (let i in props) obj[i] = props[i];
	return /** @type {O & P} */ (obj);
}

/**
 * Remove a child node from its parent if attached. This is a workaround for
 * IE11 which doesn't support `Element.prototype.remove()`. Using this function
 * is smaller than including a dedicated polyfill.
 * 调用父节点的 removeChild 方法移除节点
 * @param {preact.ContainerNode} node The node to remove 真实的DOM节点
 */
export function removeNode(node) {
	let parentNode = node.parentNode;
	if (parentNode) parentNode.removeChild(node);
}

export const slice = EMPTY_ARR.slice;
