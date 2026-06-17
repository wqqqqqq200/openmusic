import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Room from './pages/Room';
import TvDisplay from './pages/TvDisplay';

export default function App() {
  return (
    <div className="h-full">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="/tv/:roomId" element={<TvDisplay />} />
      </Routes>
    </div>
  );
}
