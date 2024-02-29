import { useState } from 'preact/hooks';
import preactLogo from './assets/preact.svg';
import viteLogo from '/vite.svg';
import './app.css';

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
