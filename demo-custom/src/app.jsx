import { useState, useEffect } from 'preact/hooks';
import './app.css';

import test from './test/index';

// test();

export function App() {
	const [list, setList] = useState(['A', 'B', 'C']);

	useEffect(() => {
		setTimeout(() => {
			setList(['B', 'C', 'A']);
		}, 3000);
	}, []);

	return (
		<>
			{list.map(item => (
				<div key={item}>{item}</div>
			))}
		</>
	);
}
