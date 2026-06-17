import { useAudioPlayer } from '../hooks/useAudioPlayer';
import AudioUnlockOverlay from './AudioUnlockOverlay';

interface Props {
  tvMode?: boolean;
}

export default function AudioEngine({ tvMode = false }: Props) {
  useAudioPlayer({ tvMode });
  return <AudioUnlockOverlay tvMode={tvMode} />;
}
