import { expect, it, vi } from 'vitest';
import { createRefreshGate, recoverWorkspaceRead, TransientWorkspaceError } from '../src/lib/workspace-refresh';
import { classifyDatabaseFailure, DatabaseError } from '../src/lib/database';

it('coalesces overlapping events but replaces a pre-mutation or invalidated request', async () => {
  const gate = createRefreshGate();
  let finish!: () => void;
  let signal!: AbortSignal;
  const work = vi.fn((s: AbortSignal) => { signal=s; return new Promise<void>(resolve => { finish=resolve; }); });
  const first = gate.run(work);
  expect(gate.run(work)).toBe(first);
  expect(work).toHaveBeenCalledTimes(1);
  const oldSignal = signal, oldFinish = finish;
  const replacement = gate.run(work,false);
  expect(oldSignal.aborted).toBe(true);
  oldFinish(); await first;
  expect(gate.run(work)).toBe(replacement);
  gate.invalidate(); expect(signal.aborted).toBe(true);
  finish(); await replacement;
});

it('revalidates on exactly one transient retry, and never retries permanent errors', async () => {
  vi.useFakeTimers();
  try {
    const operation=vi.fn().mockRejectedValueOnce(new TransientWorkspaceError()).mockResolvedValue(undefined);
    const result=recoverWorkspaceRead(operation,new AbortController().signal);
    await vi.runAllTimersAsync(); await result;
    expect(operation).toHaveBeenCalledTimes(2);
    const permanent=vi.fn().mockRejectedValue(new Error('denied'));
    await expect(recoverWorkspaceRead(permanent,new AbortController().signal)).rejects.toThrow('denied');
    expect(permanent).toHaveBeenCalledTimes(1);
    const repeated=vi.fn().mockRejectedValue(new TransientWorkspaceError('unavailable'));
    const failure=expect(recoverWorkspaceRead(repeated,new AbortController().signal)).rejects.toThrow('unavailable');
    await vi.runAllTimersAsync(); await failure;
    expect(repeated).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

it('cancels recovery when authentication or visibility invalidates a request', async () => {
  const controller=new AbortController();
  const operation=vi.fn().mockRejectedValue(new TransientWorkspaceError());
  const result=recoverWorkspaceRead(operation,controller.signal);
  controller.abort();
  await expect(result).rejects.toBeDefined();
  expect(operation).toHaveBeenCalledTimes(1);
});

it.each([
  ['timeout exceeded when trying to connect',undefined,'pool_timeout',true],
  ['Connection terminated due to connection timeout',undefined,'connect_timeout',true],
  ['private sql and password','ECONNRESET','network',true],
  ['private sql and password','EPIPE','network',true],
  ['private sql and password','ERR_TLS_CERT_ALTNAME_INVALID','network',false],
  ['private sql and password','42P01','sqlstate',false],
  ['private sql and password','57014','query_timeout',false],
  ['Query read timeout',undefined,'query_timeout',false],
  ['private sql and password',undefined,'unknown',false],
])('classifies safely: %s %s', (message,code,kind,retryable) => {
  const error=Object.assign(new Error(message),{code});
  expect(classifyDatabaseFailure(error)).toMatchObject({kind,retryable});
  expect(JSON.stringify(new DatabaseError(error))).not.toContain('private');
});
