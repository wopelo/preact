import { useState } from 'preact/hooks';
import './app.css';

// import { constructNewChildrenArray } from './test/diffTest';

// constructNewChildrenArray(
// 	['A', 'B', 'C', 'D', 'E', 'F'].map(value => ({ value, _flags: [] })),
// 	['B', 'A', 'C', 'D', 'F', 'E'].map(value => ({ value, _flags: [] }))
// );

export function App() {
	const [list, setList] = useState(['A', 'B', 'C', 'D', 'E', 'F']);

	return (
		<>
			<div class="card">
				{list.map(item => (
					<div key={item}>{item}</div>
				))}
			</div>
			<div class="card">
				<button onClick={() => setList(['B', 'A', 'C', 'D', 'F', 'E'])}>
					Change List
				</button>
			</div>
		</>
	);
}
