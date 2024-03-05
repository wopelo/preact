import { useState } from 'preact/hooks';
import './app.css';

import { constructNewChildrenArray } from './test/diffTest';

constructNewChildrenArray(
	['A', 'B', 'C', 'D', 'E', 'F'].map(value => ({ value, _flags: [] })),
	['B', 'A', 'C', 'D', 'F', 'E'].map(value => ({ value, _flags: [] }))
);

export function App() {
	const [count, setCount] = useState(0);

	return (
		<>
			<h1>Vite + Preact</h1>
			<div class="card">
				<button onClick={() => setCount(count => count + 1)}>Add count</button>
				<p>count is {count}</p>
			</div>
		</>
	);
}
