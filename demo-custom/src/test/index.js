import { constructNewChildrenArray } from './diffTest';

export default function test() {
  // constructNewChildrenArray(
  //   ['A', 'B', 'C'].map(value => ({ value, _flags: [] })),
  //   ['A', 'B', 'C'].map(value => ({ value, _flags: [] }))
  // );
  
  // A 被标记为 INSERT_VNODE
  constructNewChildrenArray(
    ['B', 'C', 'A'].map(value => ({ value, _flags: [] })),
    ['A', 'B', 'C'].map(value => ({ value, _flags: [] })),
  );

  // C 被标记为 INSERT_VNODE
  constructNewChildrenArray(
    ['C', 'A', 'B'].map(value => ({ value, _flags: [] })),
    ['A', 'B', 'C'].map(value => ({ value, _flags: [] })),
  );

  // D 被标记为 INSERT_VNODE，B 被移除
  constructNewChildrenArray(
    ['A', 'D', 'C'].map(value => ({ value, _flags: [] })),
    ['A', 'B', 'C'].map(value => ({ value, _flags: [] })),
  );
  
  // constructNewChildrenArray(
  // 	['A', 'B', 'C', 'D', 'E', 'F'].map(value => ({ value, _flags: [] })),
  // 	['B', 'A', 'C', 'D', 'F', 'E'].map(value => ({ value, _flags: [] }))
  // );
}