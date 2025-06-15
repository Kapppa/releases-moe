import { writable, type Writable } from 'simple-store-svelte'
import { type ProgressBar } from '@prgm/sveltekit-progress-bar'
import type { Entry } from './schemas'
import type { SortKey } from 'svelte-headless-table/plugins'
import { idList } from '$lib/anilist'
import { client } from '$lib/pocketbase'
import type { ListResult } from 'pocketbase'
import type { EntriesResponse, TorrentsResponse } from '$lib/pocketbase/generated-types'

export const data = writable<Entry[]>([])

export const serverItemCount = writable(0)

export const progress: Writable<ProgressBar | null> = writable(null)

export const loading = writable(false)

type Texpand = {
  trs: TorrentsResponse[]
}

const SORT_ID_MAP: { [key: string]: string } = {
  episodes: 'EPISODES',
  seasonYear: 'START_DATE',
  title: 'TITLE_ROMAJI',
  format: 'FORMAT'
}

const SEADEX_SORTERS_LIST: string[] = ["updated"]

// these loads have race conditions, oh well

async function load (pageIndex: number, perPage: number, filterValues: Record<string, unknown>, sortKeys: SortKey[], ids?: number[]) {
  const sortID = sortKeys[0]?.id
  let sort = SORT_ID_MAP[sortID] || undefined
  const search = filterValues.title as string || undefined
  let total: number

  const entries: Entry[] = []
  
  if (SEADEX_SORTERS_LIST.includes(sortID)) {

    const res: ListResult<EntriesResponse<Texpand>> = await client.collection('entries').getList(pageIndex+1, perPage, {
      sort: `${sortKeys[0].order === 'desc'? '-' : ''}${sortID}`,
      expand: 'trs'
    })
    progress.value?.setWidthRatio(0.7)
    progress.value?.animate()

    total = res.totalItems
    const alRes = await idList({ ids: res.items.map(x=>x.alID), pageIndex:0, perPage, search, sort, format: (filterValues.format as string[])?.length ? filterValues.format as string[] : undefined })

    const dbmap: { [key: string]: any } = {}
    for (const media of alRes.media) {
      dbmap[media.id] = media
    }
    
    for (const entry of res.items) {
      const media = dbmap[entry.alID] || {}
      const obj = {
        ...entry,
        ...media,
        dbid: entry?.id ? '' + entry.id : ''
      } as Entry
      entries.push(obj)
    }

  } else {
    
    if (sort && sortKeys[0].order === 'desc') {
      sort += '_DESC'
    }
    const alRes = await idList({ ids, pageIndex, perPage, search, sort, format: (filterValues.format as string[])?.length ? filterValues.format as string[] : undefined })
    progress.value?.setWidthRatio(0.7)
    progress.value?.animate()
    const res: ListResult<EntriesResponse<Texpand>> = await client.collection('entries').getList(1, perPage, {
      filter: alRes.media.map(({ id }) => 'alID=' + id).join('||'),
      skipTotal: true,
      expand: 'trs'
    })

    total = alRes.pageInfo.total
    
    const dbmap: { [key: string]: EntriesResponse<Texpand> } = {}
    for (const entry of res.items) {
      dbmap[entry.alID] = entry
    }

    for (const media of alRes.media) {
      const entry = dbmap[media.id] || {}
      const obj = {
        ...entry,
        ...media,
        dbid: entry?.id ? '' + entry.id : ''
      } as Entry
      entries.push(obj)
    }
  }
  
  serverItemCount.value = Math.min(ids?.length || Infinity, total)
  progress.value?.complete()
  return entries
}

export async function loadFromCache (pageIndex: number, perPage: number, filterValues: Record<string, unknown>, sortKeys: SortKey[], ids: number[]) {
  const cache = localStorage.getItem('entries')
  if (cache) {
    try {
      const entries = JSON.parse(cache) as Entry[]
      data.value = entries.filter(entry => ids.includes(entry.alID))
      serverItemCount.value = entries.length
    } catch (e) {
      localStorage.removeItem('entries')
    }
  }
  const res = await load(pageIndex, perPage, filterValues, sortKeys, ids)
  data.value = res
  localStorage.setItem('entries', JSON.stringify(res))
}

export async function query (pageIndex: number, perPage: number, filterValues: Record<string, unknown>, sortKeys: SortKey[], ids?: number[]) {
  progress.value?.start()
  loading.value = true
  data.value = []
  data.value = await load(pageIndex, perPage, filterValues, sortKeys, ids)
  loading.value = false
}
