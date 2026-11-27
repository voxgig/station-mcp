import * as StationLib from '@voxgig/station'
import { Station } from '@voxgig/station'

export const ENTITY = {
  planet: { op: { list: {}, load: {}, create: {}, update: {}, remove: {} } },
  moon: { op: { list: {}, load: {} } },
}

// A client as sdkgen generates one: an accessor per entity, whose
// operations resolve to entities that hold their data.
export function fakeSDK(slug: string) {
  const config: any = {
    main: { slug, name: 'Solardemo', version: '1.0.0' },
    options: { server: {} },
    entity: ENTITY,
  }
  const store: any = {
    planet: [{ id: 'planet-0001', name: 'Early Raven' }, { id: 'planet-0002', name: 'Golden Beacon' }],
    moon: [{ id: 'moon-0001', planet_id: 'planet-0001' }],
  }
  const wrap = (data: any) => ({ data: () => ({ ...data }) })
  const entity = (name: string) => ({
    list: async (_query: any) => store[name].map(wrap),
    load: async (query: any) => {
      const hit = store[name].find((r: any) => r.id === query.id)
      if (undefined === hit) { throw new Error('not found: ' + query.id + ' with key sk-live-0123456789') }
      return wrap(hit)
    },
    create: async (data: any) => { store[name].push(data); return wrap(data) },
    update: async (data: any) => wrap(data),
    remove: async (query: any) => wrap(query),
  })
  class SDK {
    _features = [{ name: 'station' }]
    _mode = 'test'
    constructor(options: any) {
      const fopts = byname(options?.feature).station
      StationLib.featureBinding({
        client: this,
        utility: { fetcher: async () => ({ status: 200 }) },
        options: { feature: {} },
        config,
      }, fopts)
    }
    Planet() { return entity('planet') }
    Moon() { return entity('moon') }
  }
  return SDK
}

export function byname(feature: any): any {
  return Array.isArray(feature)
    ? Object.fromEntries(feature.map(({ name, ...rest }: any) => [name, rest]))
    : feature || {}
}

export function station(config: any = null): Station {
  return new Station({ config, proxy: 'off', load: false })
}

// A config whose instance `solar` sets `agent.write`, as a write tool needs.
export function agentwrite(write: any): any {
  return { station: 1, profiles: { default: { sdk: { solar: { agent: { write } } } } } }
}
