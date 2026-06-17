import type { MusicProviderMeta, MusicProvider } from './types';
import { neteaseProvider, tencentProvider } from './providers/meting';
import { kugouProvider } from './providers/kugou';
import type { MusicSource } from '../../types';

export const providers: Record<MusicSource, MusicProvider> = {
  netease: neteaseProvider,
  tencent: tencentProvider,
  kugou: kugouProvider,
};

export function getAllSources(): MusicProviderMeta[] {
  return Object.values(providers).map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    color: p.color,
    supportsSearch: p.supportsSearch,
    supportsIdLookup: p.supportsIdLookup,
    description: p.description,
  }));
}
