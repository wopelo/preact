import { diff, unmount, applyRef } from './index';
import { createVNode, Fragment } from '../create-element';
import { EMPTY_OBJ, EMPTY_ARR, INSERT_VNODE, MATCHED } from '../constants';
import { isArray } from '../util';
import { getDomSibling } from '../component';

/**
 * Diff the children of a virtual node
 * @param {PreactElement} parentDom The DOM element whose children are being
 * diffed
 * @param {ComponentChildren[]} renderResult
 * @param {VNode} newParentVNode The new virtual node whose children should be
 * diff'ed against oldParentVNode
 * @param {VNode} oldParentVNode The old virtual node whose children should be
 * diff'ed against newParentVNode
 * @param {object} globalContext The current context object - modified by
 * getChildContext
 * @param {boolean} isSvg Whether or not this DOM node is an SVG node
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
export function diffChildren(
	parentDom,
	renderResult,
	newParentVNode,
	oldParentVNode,
	globalContext,
	isSvg,
	excessDomChildren,
	commitQueue,
	oldDom,
	isHydrating,
	refQueue
) {
	let i,
		/** @type {VNode} */
		oldVNode,
		/** @type {VNode} */
		childVNode,
		/** @type {PreactElement} */
		newDom,
		/** @type {PreactElement} */
		firstChildDom;

	// This is a compression of oldParentVNode!=null && oldParentVNode != EMPTY_OBJ && oldParentVNode._children || EMPTY_ARR
	// as EMPTY_OBJ._children should be `undefined`.
	/** @type {VNode[]} */
	let oldChildren = (oldParentVNode && oldParentVNode._children) || EMPTY_ARR;

	let newChildrenLength = renderResult.length;

	newParentVNode._nextDom = oldDom;
	constructNewChildrenArray(newParentVNode, renderResult, oldChildren);
	oldDom = newParentVNode._nextDom;

	for (i = 0; i < newChildrenLength; i++) {
		childVNode = newParentVNode._children[i];
		if (
			childVNode == null ||
			typeof childVNode == 'boolean' ||
			typeof childVNode == 'function'
		) {
			continue;
		}

		// At this point, constructNewChildrenArray has assigned _index to be the
		// matchingIndex for this VNode's oldVNode (or -1 if there is no oldVNode).
		if (childVNode._index === -1) {
			oldVNode = EMPTY_OBJ;
		} else {
			oldVNode = oldChildren[childVNode._index] || EMPTY_OBJ;
		}

		// Update childVNode._index to its final index
		childVNode._index = i;

		// Morph the old element into the new one, but don't append it to the dom yet
		diff(
			parentDom,
			childVNode,
			oldVNode,
			globalContext,
			isSvg,
			excessDomChildren,
			commitQueue,
			oldDom,
			isHydrating,
			refQueue
		);

		// Adjust DOM nodes
		newDom = childVNode._dom;
		if (childVNode.ref && oldVNode.ref != childVNode.ref) {
			if (oldVNode.ref) {
				applyRef(oldVNode.ref, null, childVNode);
			}
			refQueue.push(
				childVNode.ref,
				childVNode._component || newDom,
				childVNode
			);
		}

		if (firstChildDom == null && newDom != null) {
			firstChildDom = newDom;
		}

		if (
			childVNode._flags & INSERT_VNODE ||
			oldVNode._children === childVNode._children
		) {
			oldDom = insert(childVNode, oldDom, parentDom);
		} else if (
			typeof childVNode.type == 'function' &&
			childVNode._nextDom !== undefined
		) {
			// Since Fragments or components that return Fragment like VNodes can
			// contain multiple DOM nodes as the same level, continue the diff from
			// the sibling of last DOM child of this child VNode
			oldDom = childVNode._nextDom;
		} else if (newDom) {
			oldDom = newDom.nextSibling;
		}

		// Eagerly cleanup _nextDom. We don't need to persist the value because it
		// is only used by `diffChildren` to determine where to resume the diff
		// after diffing Components and Fragments. Once we store it the nextDOM
		// local var, we can clean up the property. Also prevents us hanging on to
		// DOM nodes that may have been unmounted.
		childVNode._nextDom = undefined;

		// Unset diffing flags
		childVNode._flags &= ~(INSERT_VNODE | MATCHED);
	}

	// TODO: With new child diffing algo, consider alt ways to diff Fragments.
	// Such as dropping oldDom and moving fragments in place
	//
	// Because the newParentVNode is Fragment-like, we need to set it's
	// _nextDom property to the nextSibling of its last child DOM node.
	//
	// `oldDom` contains the correct value here because if the last child
	// is a Fragment-like, then oldDom has already been set to that child's _nextDom.
	// If the last child is a DOM VNode, then oldDom will be set to that DOM
	// node's nextSibling.
	newParentVNode._nextDom = oldDom;
	newParentVNode._dom = firstChildDom;
}

/**
 * @param {VNode} newParentVNode
 * @param {ComponentChildren[]} renderResult
 * @param {VNode[]} oldChildren
 */
function constructNewChildrenArray(newParentVNode, renderResult, oldChildren) {
	/** @type {number} */
	let i;
	/** @type {VNode} */
	let childVNode;
	/** @type {VNode} */
	let oldVNode;

	const newChildrenLength = renderResult.length;
	let oldChildrenLength = oldChildren.length,
		remainingOldChildren = oldChildrenLength; // 剩余需要搜索的旧虚拟节点数量，用于在旧节点数组中查找新节点对应位置所用

	let skew = 0;

	newParentVNode._children = [];

	for (i = 0; i < newChildrenLength; i++) {
		// @ts-expect-error We are reusing the childVNode variable to hold both the
		// pre and post normalized childVNode
		childVNode = renderResult[i];

		// 接下来的这一串 if- else 都会执行 childVNode = newParentVNode._children[i] = xxx 的操作
		// 目的是根据子组件渲染结果，填充 newParentVNode 的子元素
		if (
			childVNode == null ||
			typeof childVNode == 'boolean' ||
			typeof childVNode == 'function'
		) {
			// 某个组件返回 null 或 布尔值 或 函数 或 class，这种情况视为无效
			childVNode = newParentVNode._children[i] = null;
		}
		// If this newVNode is being reused (e.g. <div>{reuse}{reuse}</div>) in the same diff,
		// or we are rendering a component (e.g. setState) copy the oldVNodes so it can have
		// it's own DOM & etc. pointers
		else if (
			typeof childVNode == 'string' ||
			typeof childVNode == 'number' ||
			// eslint-disable-next-line valid-typeof
			typeof childVNode == 'bigint' ||
			childVNode.constructor == String
		) {
			// 某个组件返回 字符串 或 数字 或 大整数，则创建对应的VNode
			childVNode = newParentVNode._children[i] = createVNode(
				null,
				childVNode,
				null,
				null,
				null
			);
		} else if (isArray(childVNode)) {
			// 某个组件返回数组，则创建对应的VNode
			childVNode = newParentVNode._children[i] = createVNode(
				Fragment,
				{ children: childVNode },
				null,
				null,
				null
			);
		} else if (childVNode.constructor === undefined && childVNode._depth > 0) {
			// VNode is already in use, clone it. This can happen in the following
			// scenario:
			//   const reuse = <div />
			//   <div>{reuse}<span />{reuse}</div>
			childVNode = newParentVNode._children[i] = createVNode(
				childVNode.type,
				childVNode.props,
				childVNode.key,
				childVNode.ref ? childVNode.ref : null,
				childVNode._original
			);
		} else {
			childVNode = newParentVNode._children[i] = childVNode;
		}

		const skewedIndex = i + skew;

		// Handle unmounting null placeholders, i.e. VNode => null in unkeyed children
		if (childVNode == null) {
			oldVNode = oldChildren[skewedIndex];
			if (
				oldVNode &&
				oldVNode.key == null &&
				oldVNode._dom &&
				(oldVNode._flags & MATCHED) === 0
			) {
				if (oldVNode._dom == newParentVNode._nextDom) {
					newParentVNode._nextDom = getDomSibling(oldVNode);
				}
				unmount(oldVNode, oldVNode, false);

				// Explicitly nullify this position in oldChildren instead of just
				// setting `_match=true` to prevent other routines (e.g.
				// `findMatchingIndex` or `getDomSibling`) from thinking VNodes or DOM
				// nodes in this position are still available to be used in diffing when
				// they have actually already been unmounted. For example, by only
				// setting `_match=true` here, the unmounting loop later would attempt
				// to unmount this VNode again seeing `_match==true`.  Further,
				// getDomSibling doesn't know about _match and so would incorrectly
				// assume DOM nodes in this subtree are mounted and usable.
				oldChildren[skewedIndex] = null;
				remainingOldChildren--;
			}
			continue;
		}

		childVNode._parent = newParentVNode;
		childVNode._depth = newParentVNode._depth + 1;

		// 查找新节点是否能在旧节点数组中匹配到，matchingIndex是新节点在旧节点数组中的索引
		const matchingIndex = findMatchingIndex(
			childVNode,
			oldChildren,
			skewedIndex,
			remainingOldChildren
		);

		// Temporarily store the matchingIndex on the _index property so we can pull
		// out the oldVNode in diffChildren. We'll override this to the VNode's
		// final index after using this property to get the oldVNode
		childVNode._index = matchingIndex; // 暂时将匹配到的索引（有可能为-1）存储到_index属性上

		oldVNode = null;
		if (matchingIndex !== -1) {
			// 旧节点数组中匹配到了新节点
			oldVNode = oldChildren[matchingIndex];
			remainingOldChildren--; // 剩余需要搜索的旧虚拟节点数量减1
			if (oldVNode) {
				oldVNode._flags |= MATCHED; // 将找到的节点标记为已匹配
			}
		}

		// Here, we define isMounting for the purposes of the skew diffing
		// algorithm. Nodes that are unsuspending are considered mounting and we detect
		// this by checking if oldVNode._original === null
		const isMounting = oldVNode == null || oldVNode._original === null;

		if (isMounting) {
			if (matchingIndex == -1) {
				skew--;
			}

			// If we are mounting a DOM VNode, mark it for insertion
			if (typeof childVNode.type != 'function') {
				childVNode._flags |= INSERT_VNODE;
			}
		} else if (matchingIndex !== skewedIndex) {
			if (matchingIndex === skewedIndex + 1) {
				skew++;
			} else if (matchingIndex > skewedIndex) {
				if (remainingOldChildren > newChildrenLength - skewedIndex) {
					skew += matchingIndex - skewedIndex;
				} else {
					skew--;
				}
			} else if (matchingIndex < skewedIndex) {
				if (matchingIndex == skewedIndex - 1) {
					skew = matchingIndex - skewedIndex;
				}
			} else {
				skew = 0;
			}

			// Move this VNode's DOM if the original index (matchingIndex) doesn't
			// match the new skew index (i + new skew)
			// 虚拟节点在旧数组中的位置（matchingIndex）与其在新数组中的位置（i + skew）不一致，那么就需要移动这个虚拟节点对应的 DOM 元素
			if (matchingIndex !== i + skew) {
				childVNode._flags |= INSERT_VNODE;
			}
		}
	}

	// Remove remaining oldChildren if there are any. Loop forwards so that as we
	// unmount DOM from the beginning of the oldChildren, we can adjust oldDom to
	// point to the next child, which needs to be the first DOM node that won't be
	// unmounted.
	// 如果还有剩余的 oldChildren，那么就需要将它们移除
	if (remainingOldChildren) {
		for (i = 0; i < oldChildrenLength; i++) {
			oldVNode = oldChildren[i];
			if (oldVNode != null && (oldVNode._flags & MATCHED) === 0) {
				if (oldVNode._dom == newParentVNode._nextDom) {
					newParentVNode._nextDom = getDomSibling(oldVNode);
				}

				unmount(oldVNode, oldVNode);
			}
		}
	}
}

/**
 * @param {VNode} parentVNode
 * @param {PreactElement} oldDom
 * @param {PreactElement} parentDom
 * @returns {PreactElement}
 */
function insert(parentVNode, oldDom, parentDom) {
	// Note: VNodes in nested suspended trees may be missing _children.

	if (typeof parentVNode.type == 'function') {
		let children = parentVNode._children;
		for (let i = 0; children && i < children.length; i++) {
			if (children[i]) {
				// If we enter this code path on sCU bailout, where we copy
				// oldVNode._children to newVNode._children, we need to update the old
				// children's _parent pointer to point to the newVNode (parentVNode
				// here).
				children[i]._parent = parentVNode;
				oldDom = insert(children[i], oldDom, parentDom);
			}
		}

		return oldDom;
	} else if (parentVNode._dom != oldDom) {
		parentDom.insertBefore(parentVNode._dom, oldDom || null);
		oldDom = parentVNode._dom;
	}

	do {
		oldDom = oldDom && oldDom.nextSibling;
	} while (oldDom != null && oldDom.nodeType === 8);

	return oldDom;
}

/**
 * Flatten and loop through the children of a virtual node
 * @param {ComponentChildren} children The unflattened children of a virtual
 * node
 * @returns {VNode[]}
 */
export function toChildArray(children, out) {
	out = out || [];
	if (children == null || typeof children == 'boolean') {
	} else if (isArray(children)) {
		children.some(child => {
			toChildArray(child, out);
		});
	} else {
		out.push(children);
	}
	return out;
}

/**
 * 该函数用于在一个旧VNode数组中，找到新VNode对应的索引。找到的根据是新旧两个节点key和type相同，且旧节点没有被遍历过。
 * @param {VNode} childVNode
 * @param {VNode[]} oldChildren
 * @param {number} skewedIndex 开始搜索的索引位置，从新节点在新数组的位置开始
 * @param {number} remainingOldChildren 剩余需要搜索的旧虚拟节点数量
 * @returns {number}
 */
function findMatchingIndex(
	childVNode,
	oldChildren,
	skewedIndex,
	remainingOldChildren
) {
	const key = childVNode.key;
	const type = childVNode.type;
	let x = skewedIndex - 1;
	let y = skewedIndex + 1;
	let oldVNode = oldChildren[skewedIndex]; // 相同位置的节点

	// We only need to perform a search if there are more children
	// (remainingOldChildren) to search. However, if the oldVNode we just looked
	// at skewedIndex was not already used in this diff, then there must be at
	// least 1 other (so greater than 1) remainingOldChildren to attempt to match
	// against. So the following condition checks that ensuring
	// remainingOldChildren > 1 if the oldVNode is not already used/matched. Else
	// if the oldVNode was null or matched, then there could needs to be at least
	// 1 (aka `remainingOldChildren > 0`) children to find and compare against.
	// `shouldSearch` 变量决定了是否需要在 `oldChildren` 中进行搜索以找到与 `childVNode` 匹配的节点。只有当 `oldChildren` 中还有未匹配的节点时，才需要进行搜索。
	// 如果在 `skewedIndex` 位置的 `oldVNode` 还未在当前的 diff 过程中被使用，那么至少还有一个其他的节点可以尝试进行匹配，因此 `remainingOldChildren` 必须大于1。
	// 这就是 `shouldSearch` 的赋值表达式 `remainingOldChildren > (oldVNode != null && (oldVNode._flags & MATCHED) === 0 ? 1 : 0)` 中的 `1` 的来源。
	// 如果 `oldVNode` 已经被匹配过，或者 `oldVNode` 为 `null`，那么只需要 `oldChildren` 中至少还有1个节点未被匹配，就需要进行搜索。这就是 `shouldSearch` 的赋值表达式中的 `0` 的来源。
	let shouldSearch =
		remainingOldChildren >
		(oldVNode != null && (oldVNode._flags & MATCHED) === 0 ? 1 : 0);
	// 还有不为null的节点没有被匹配上，则至少还有1个节点要遍历；如果当前节点为null，或者已经匹配上了，则需要继续遍历剩余的旧节点

	if (
		oldVNode === null ||
		(oldVNode &&
			key == oldVNode.key &&
			type === oldVNode.type &&
			(oldVNode._flags & MATCHED) === 0)
	) {
		// 如果相同位置上的节点是null，或者key/type完全相同且旧节点还没有被匹配上，则视为匹配成功
		return skewedIndex;
	} else if (shouldSearch) {
		// 相同位置的节点没有匹配上，且需要继续搜索
		while (x >= 0 || y < oldChildren.length) {
			// 同时向前和向后搜索
			if (x >= 0) {
				oldVNode = oldChildren[x];
				if (
					oldVNode &&
					(oldVNode._flags & MATCHED) === 0 &&
					key == oldVNode.key &&
					type === oldVNode.type
				) {
					return x;
				}
				x--; // 没有匹配成功则继续往前找
			}

			if (y < oldChildren.length) {
				oldVNode = oldChildren[y];
				if (
					oldVNode &&
					(oldVNode._flags & MATCHED) === 0 &&
					key == oldVNode.key &&
					type === oldVNode.type
				) {
					return y;
				}
				y++; // 没有匹配成功则继续往后找
			}
		}
	}

	return -1; // 没找到
}
