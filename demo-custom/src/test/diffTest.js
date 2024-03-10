export function constructNewChildrenArray(newChildren, oldChildren) {
	console.log('开始运行')

	let i;
	let childVNode;
	let oldVNode;

	const newChildrenLength = newChildren.length;
	let oldChildrenLength = oldChildren.length,
		remainingOldChildren = oldChildrenLength;

	let skew = 0;

	for (i = 0; i < newChildrenLength; i++) {
		childVNode = newChildren[i];

		const skewedIndex = i + skew;

		const matchingIndex = oldChildren.findIndex(
			item => item.value === childVNode.value
		);
		childVNode._index = matchingIndex; // 暂时将匹配到的索引（有可能为-1）存储到_index属性上
		oldVNode = null;

		console.log('xxxxx', {
			i,
			childVNode,
			skew,
			skewedIndex,
			matchingIndex,
			remainingOldChildren
		})

		if (matchingIndex !== -1) {
			// 旧节点数组中匹配到了新节点
			oldVNode = oldChildren[matchingIndex];
			remainingOldChildren--; // 剩余需要搜索的旧虚拟节点数量减1
			if (oldVNode) {
				oldVNode._flags.push('MATCHED'); // 将找到的节点标记为已匹配
			}
		}

		if (matchingIndex !== skewedIndex) {
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

			console.log('skew更新后: ', skew)

			// Move this VNode's DOM if the original index (matchingIndex) doesn't
			// match the new skew index (i + new skew)
			// 虚拟节点在旧数组中的位置（matchingIndex）与其在新数组中的位置（i + skew）不一致，那么就需要移动这个虚拟节点对应的 DOM 元素
			if (matchingIndex !== i + skew) {
				childVNode._flags.push('INSERT_VNODE');
			}
		}
	}

	// 如果还有剩余的 oldChildren，那么就需要将它们移除
	if (remainingOldChildren) {
		for (i = 0; i < oldChildrenLength; i++) {
			oldVNode = oldChildren[i];
			if (oldVNode != null && !oldVNode._flags.includes('MATCHED')) {
				oldVNode._flags.push('REMOVE');
			}
		}
	}

	console.log('运行后: ', {
		newChildren,
		oldChildren
	});
}
