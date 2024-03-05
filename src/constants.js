// << 是 JavaScript 中的位移运算符，表示左移操作。比如 a << b，它的意思是将 a 的二进制表示向左移动 b 位
/** Normal hydration that attaches to a DOM tree but does not diff it. */
export const MODE_HYDRATE = 1 << 5; // 32 表示正常的 hydration 操作，它会附加到 DOM 树上，但不会对其进行差异比较
/** Signifies this VNode suspended on the previous render */
export const MODE_SUSPENDED = 1 << 7; // 128 表示在上一次渲染中，这个 VNode 被挂起了
/** Indicates that this node needs to be inserted while patching children */
export const INSERT_VNODE = 1 << 16; // 65536 表示在 patching 子节点时，需要插入这个节点
/** Indicates a VNode has been matched with another VNode in the diff */
export const MATCHED = 1 << 17; // 131072 表示一个 VNode 已经和另一个 VNode 在 diff 中匹配上了

// 这些常量通常用于在代码中设置或者检查某些状态。
// 例如检查是否有某种状态：
// if (vnode.flags & MODE_HYDRATE) {
//   // do something
// }
// 这段代码检查了 vnode.flags 是否包含 MODE_HYDRATE

// 例如设置某种状态：
// childVNode._flags |= INSERT_VNODE
// 这段代码将 INSERT_VNODE 添加到 childVNode._flags 中，如果 childVNode._flags 没有包含 INSERT_VNODE 的话

/** Reset all mode flags */
export const RESET_MODE = ~(MODE_HYDRATE | MODE_SUSPENDED);

export const EMPTY_OBJ = /** @type {any} */ ({});
export const EMPTY_ARR = [];
export const IS_NON_DIMENSIONAL =
	/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
