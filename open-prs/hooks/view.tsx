import type { EngineInterface, RenderChildren } from 'claude-code'

import { LIMIT } from './provider'
import { type IconName, iconSvg, progressSvg, statusBarSvg } from './icons'
import {
  RUN_GLYPH,
  bar,
  ciSummary,
  clockOf,
  failureKind,
  legendLabel,
  legendText,
  noun,
  statusLabel,
  statusLine,
  threadSummary,
  TONE,
  unresolvedLabel,
  unresolvedText,
} from './cards'
import type { CardBase, ErrorsCard, OtherCard, PaneModel, SessionCard, SessionRow, Threads } from './pane-model'
import type { OpenPr, Run } from '../types'

export type Parts = ReturnType<EngineInterface['ui']['resolve']>
export type SvgPart = Extract<Parts, { Svg: unknown }>['Svg']

/** What a press on the pane does. The view calls these and never touches the engine. */
export type Actions = {
  refresh: () => void
  toggle: (id: string) => void
  closeErrors: () => void
}

const RUN_TONE = {
  queued: 'inactive',
  running: 'suggestion',
  succeeded: 'success',
  partial: 'warning',
  failed: 'error',
  cancelled: 'inactive',
} as const

const STATUS_ICON: Partial<Record<string, IconName>> = { changes: 'changes', required: 'required', approved: 'approved', draft: 'draft', none: 'branch', merged: 'merged', closed: 'changes' }

const RULE = '─'.repeat(30)

/** Draws the pane model. The desktop (`Svg` given) draws Lucide icons and SVG bars; every other surface keeps glyph text. */
export const pane = (parts: Parts, Svg: SvgPart | null, model: PaneModel, actions: Actions) => {
  const { Box, Button, Link, Text } = parts

  // The desktop draws a Lucide icon in the tone's colour; every other surface keeps the glyph text.
  const lead = (key: string, icon: IconName | null, tone: string | undefined, glyphText: string, label: string) =>
    Svg && icon ? (
      <Box key={key} flexDirection="row" columnGap={1}>
        <Svg source={iconSvg(icon, tone ?? 'inactive')} alt={label} width={14} height={14} />
        <Text color={tone}>{label}</Text>
      </Box>
    ) : (
      <Text key={key} color={tone}>
        {glyphText}
      </Text>
    )

  const refreshButton = (isRefreshing: boolean) => (
    <Box flexDirection="row" columnGap={1}>
      <Button key="refresh" label="Refresh" onPress={actions.refresh} />
      {isRefreshing ? <Text dimColor>Refreshing…</Text> : null}
    </Box>
  )

  const statusRow = (card: CardBase) =>
    Svg ? (
      <Svg
        key="status-bar"
        source={statusBarSvg(card.segments.map(segment => ({ tone: TONE[segment.key], width: segment.width, isStriped: segment.key === 'none' })))}
        alt="status bar"
        height={8}
      />
    ) : (
      <Box flexDirection="row">
        {card.segments.map(segment => (
          <Text key={`segment-${segment.key}`} color={TONE[segment.key]}>
            {(segment.key === 'none' ? '▒' : '█').repeat(segment.width)}
          </Text>
        ))}
      </Box>
    )

  const progressRow = (name: string, done: number, total: number, tone: string, text: string) =>
    Svg ? (
      <Box key={`progress-${name}`} flexDirection="row" columnGap={1}>
        <Text dimColor>{name}</Text>
        <Box flexGrow={1}>
          <Svg source={progressSvg(done, total, tone, true)} alt={`${name} progress`} height={6} />
        </Box>
        <Text dimColor>{text}</Text>
      </Box>
    ) : (
      <Text key={`progress-${name}`}>{text}</Text>
    )

  const summary = (name: 'threads' | 'ci', totals: { resolved: number; total: number } | { ok: number; total: number }) => {
    const done = 'ok' in totals ? totals.ok : totals.resolved
    return Svg ? (
      progressRow(name, done, totals.total, done === totals.total && totals.total > 0 ? 'success' : 'warning', `${done}/${totals.total}`)
    ) : (
      <Text>{name === 'ci' ? ciSummary({ ok: done, total: totals.total }) : threadSummary({ resolved: done, total: totals.total })}</Text>
    )
  }

  const legendRow = (card: CardBase) => (
    <Box flexDirection="row" columnGap={1}>
      {card.counts.map(count => lead(`legend-${count.key}`, STATUS_ICON[count.key] ?? null, TONE[count.key], legendText(count), legendLabel(count)))}
    </Box>
  )

  const threadBlock = (threads: Threads) =>
    threads ? (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          {Svg ? (
            <Svg source={progressSvg(threads.resolved, threads.total, threads.resolved === threads.total ? 'success' : 'warning')} alt="threads progress" width={120} height={6} />
          ) : (
            <Text color={threads.resolved === threads.total ? 'success' : 'warning'}>{bar(threads.resolved, threads.total)}</Text>
          )}
          <Text dimColor>{`${threads.resolved}/${threads.total} resolved`}</Text>
        </Box>
        {lead('unresolved', 'message', 'warning', unresolvedText(threads) ?? '', unresolvedLabel(threads) ?? '')}
      </Box>
    ) : null

  const chips = (runs: Run[]) =>
    runs.length === 0 ? null : (
      <Box flexDirection="row" columnGap={1} flexWrap={Svg ? 'wrap' : undefined} alignItems={Svg ? 'flex-start' : undefined}>
        {runs.map((run, i) =>
          Svg ? (
            <Box key={`run-${i}`} flexDirection="row" columnGap={1}>
              <Svg source={iconSvg(run.state, RUN_TONE[run.state])} alt={run.state} width={14} height={14} />
              <Link href={run.url} label={run.name} />
            </Box>
          ) : (
            <Text key={`run-${i}`} backgroundColor={RUN_TONE[run.state]}>
              {`${RUN_GLYPH[run.state]} ${run.name}`}
            </Text>
          ),
        )}
      </Box>
    )

  const branchRow = (row: SessionRow) =>
    Svg ? (
      <Box key={`branch-${row.branch}`} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
          <Box flexDirection="column">
            <Box flexDirection="row" columnGap={1}>
              {row.pr ? row.pr.url ? <Link href={row.pr.url} label={`#${row.pr.number}`} /> : <Text color="suggestion">{`#${row.pr.number}`}</Text> : null}
              <Text bold>{row.pr ? row.pr.title : row.branch}</Text>
            </Box>
            <Box flexDirection="row" columnGap={1}>
              <Text dimColor>{row.pr ? row.branch : ''}</Text>
              {row.path ? <Text dimColor>{row.path}</Text> : <Text color="warning">no worktree</Text>}
            </Box>
          </Box>
          <Box flexDirection="column" alignItems="flex-end" flexShrink={0}>
            {lead('status', STATUS_ICON[row.pr?.status ?? 'none'] ?? null, TONE[row.pr?.status ?? 'none'], statusLine(row.pr?.status ?? 'none'), statusLabel(row.pr?.status ?? 'none'))}
            {row.threads ? lead('unresolved', 'message', 'warning', unresolvedText(row.threads) ?? '', unresolvedLabel(row.threads) ?? '') : null}
          </Box>
        </Box>
        {chips(row.runs)}
        {row.threads ? (
          <Box flexDirection="row" columnGap={1}>
            <Svg source={progressSvg(row.threads.resolved, row.threads.total, row.threads.resolved === row.threads.total ? 'success' : 'warning')} alt="threads progress" width={120} height={6} />
            <Text dimColor>{`${row.threads.resolved}/${row.threads.total} resolved`}</Text>
          </Box>
        ) : null}
      </Box>
    ) : (
      <Box key={`branch-${row.branch}`} flexDirection="column">
        {row.pr ? (
          <Box flexDirection="row" columnGap={1}>
            {row.pr.url ? <Link href={row.pr.url} label={`#${row.pr.number}`} /> : <Text>{`#${row.pr.number}`}</Text>}
            <Text>{row.pr.title}</Text>
          </Box>
        ) : null}
        {lead('branch', 'branch', 'inactive', `⎇ ${row.branch}`, row.branch)}
        {row.path ? <Text dimColor>{row.path}</Text> : <Text color="warning">no worktree</Text>}
        {lead('status', STATUS_ICON[row.pr?.status ?? 'none'] ?? null, TONE[row.pr?.status ?? 'none'], statusLine(row.pr?.status ?? 'none'), statusLabel(row.pr?.status ?? 'none'))}
        {threadBlock(row.threads)}
        {chips(row.runs)}
      </Box>
    )

  const prRow = (pr: OpenPr) => (
    <Box key={`pr-${pr.number}`} flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        <Link href={pr.url} label={`#${pr.number}`} />
        <Text bold={Boolean(Svg)}>{pr.title}</Text>
      </Box>
      <Text dimColor>{pr.comments === null ? pr.author : `${pr.author} · ${noun(pr.comments, 'comment', 'comments')}`}</Text>
      {threadBlock(pr.threads)}
      {chips(pr.runs)}
    </Box>
  )

  /** The one card both lists use: header, then totals when folded, else the status bar, legend and the card's body. */
  const card = (model: CardBase, title: string, meta: string, empty: string, body: RenderChildren) => (
    <Box borderStyle="round" flexDirection="column">
      <Box flexDirection="row" columnGap={1} justifyContent={Svg ? 'space-between' : undefined}>
        <Button key={`card-${model.id}`} plain label={`${model.isFolded ? '▸' : '▾'} ${title}`} onPress={() => actions.toggle(model.id)} />
        <Text dimColor>{meta}</Text>
      </Box>
      {model.isFolded ? (
        <Box flexDirection="column">
          {statusRow(model)}
          {summary('threads', model.threads)}
          {summary('ci', model.ci)}
        </Box>
      ) : (
        <Box flexDirection="column" rowGap={1}>
          {statusRow(model)}
          {legendRow(model)}
          {model.count === 0 ? <Text dimColor>{empty}</Text> : null}
          {body}
        </Box>
      )}
    </Box>
  )

  const sessionCard = (model: SessionCard) => card(model, 'This session', noun(model.count, 'branch', 'branches'), 'No branch in this session.', model.rows.map(branchRow))

  const otherCard = (model: OtherCard) =>
    card(
      model,
      'Other open PRs',
      `${model.isCapped ? `${LIMIT}+` : String(model.count)} open`,
      'No open PRs.',
      model.groups.map(group => (
        <Box key={`group-${group.status}`} flexDirection="column">
          {lead('group', STATUS_ICON[group.status] ?? null, TONE[group.status], statusLine(group.status), statusLabel(group.status))}
          {group.prs.map(prRow)}
        </Box>
      )),
    )

  const errorsCard = (model: ErrorsCard | null) =>
    model === null ? null : (
      <Box borderStyle="round" flexDirection="column">
        <Box flexDirection="row" columnGap={1} justifyContent={Svg ? 'space-between' : undefined}>
          <Box flexDirection="row" columnGap={1}>
            <Button key="card-errors" plain label={`${model.isFolded ? '▸' : '▾'} CLI errors`} onPress={() => actions.toggle('errors')} />
            <Text dimColor>{String(model.errors.length)}</Text>
          </Box>
          <Button key="close-errors" plain label="Close" onPress={actions.closeErrors} />
        </Box>
        {model.isFolded ? null : (
          <Box flexDirection="column">
            {model.errors.map((failure, i) => (
              <Box key={`failure-${i}`} flexDirection="column">
                {i > 0 ? <Text dimColor>{RULE}</Text> : null}
                <Text color="error">{`• ${failure.command}`}</Text>
                <Text color="error">{`${failureKind(failure)} · ${clockOf(failure.at)}`}</Text>
                <Text dimColor>{failure.message}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )

  switch (model.state) {
    case 'loading':
      return <Text dimColor>Loading…</Text>
    case 'failed':
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>{`Couldn't load PRs: ${model.cli} failed or timed out. Will retry.`}</Text>
          {refreshButton(model.isRefreshing)}
          {errorsCard(model.errors)}
        </Box>
      )
    case 'no-remote':
      return <Text dimColor>{`No GitHub or Azure DevOps remote here (${model.note}).`}</Text>
    case 'ready':
      return (
        <Box flexDirection="column" rowGap={1}>
          <Box flexDirection="row" columnGap={1}>
            <Link href={model.url} label={model.slug} />
            {refreshButton(model.isRefreshing)}
          </Box>
          {sessionCard(model.session)}
          {otherCard(model.other)}
          {errorsCard(model.errors)}
        </Box>
      )
  }
}
