/**
 * State recorded by `@channel` and `@dynamicChannel`, and the checks that
 * guard against duplicate or conflicting applications.
 *
 * `channel.ts` calls into `claimChannel` before it records anything, so the
 * guard sees every application whether its address is usable or not. This
 * module does not check the address itself; that check lives in
 * `address-template.js`. It does not order channels against operations or
 * servers either; that decision belongs to the emitter.
 */
import {
  DecoratorContext,
  DiagnosticTarget,
  Interface,
  Namespace,
  Program,
} from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { SourcePosition, bySourcePosition } from "../../source-order.js";

const channelStateKey = Symbol.for("tsp-asyncapi.channel");
const channelAppliedKey = Symbol.for("tsp-asyncapi.channel.applied");

/**
 * The two types a channel can be declared on.
 * @public
 */
export type ChannelTarget = Interface | Namespace;

/**
 * State recorded by `@channel` and `@dynamicChannel` for one target.
 * It is the value type of the map `listChannels` returns, so it is part of
 * the public surface.
 * @public
 */
export interface ChannelState {
  /**
   * The address of the channel, already trimmed. It is `null` when
   * `@dynamicChannel` declared the channel, which states that the address
   * is only known at runtime.
   */
  address: string | null;
  /**
   * The explicit `channels` key given as the decorator argument.
   * It is `undefined` when the decorator was applied without one, and the
   * key then comes from the declaration name of the target.
   */
  channelId?: string;
}

/**
 * One channel declaration, with the source position it was written at.
 * The position orders the channels and picks the winner of an id clash.
 */
export interface ChannelRecord extends SourcePosition {
  state: ChannelState;
  /**
   * Where to report a problem about the address of this channel. It is the
   * address argument for `@channel`. `@dynamicChannel` has no address
   * argument, so it is the target itself there.
   */
  addressTarget: DiagnosticTarget;
}

/** Which of the two channel decorators was applied to a target. */
type ChannelKind = "channel" | "dynamic";

const [getChannelInternal, setChannel, getChannelStateMap] = useStateMap<
  ChannelTarget,
  ChannelRecord
>(channelStateKey);

const [getAppliedKinds, setAppliedKinds] = useStateMap<ChannelTarget, Set<ChannelKind>>(
  channelAppliedKey,
);

export { getChannelInternal, setChannel };

/**
 * Records that one of the two channel decorators ran on a target, and tells
 * the caller whether it may proceed.
 *
 * Two mistakes end here. The same decorator applied twice keeps one address,
 * and the author cannot tell which one. The two different decorators applied
 * together state an address and state that the address is unknown, and
 * nothing picks a winner. So the first is reported per decorator, and the
 * second drops the channel outright.
 *
 * The state holds every kind that reached the target, not the one kind that
 * claimed it first. The two mistakes are two questions, and one kind cannot
 * answer both. A target that carries `@channel` twice and `@dynamicChannel`
 * once has to hear about the duplicate and about the conflict. Recording
 * only the winner would report the conflict again for each extra `@channel`,
 * and would never mention the duplicate at all.
 *
 * The claim runs before the address is checked, the same rule
 * `singleApplication` follows. An application whose address is rejected
 * still blocks a later one, so an author who wrote the decorator twice is
 * told about it whatever the addresses say.
 *
 * @param context - The decorator context
 * @param target - The interface or namespace the decorator was applied to
 * @param kind - Which of the two decorators is running
 * @returns True when the caller may record its channel
 */
export function claimChannel(
  context: DecoratorContext,
  target: ChannelTarget,
  kind: ChannelKind,
): boolean {
  const applied = getAppliedKinds(context.program, target) ?? new Set<ChannelKind>();
  if (applied.has(kind)) {
    reportDiagnostic(context.program, {
      code:
        kind === "channel" ? "duplicate-channel-decorator" : "duplicate-dynamic-channel-decorator",
      target,
    });
    return false;
  }
  applied.add(kind);
  setAppliedKinds(context.program, target, applied);
  if (applied.size > 1) {
    // Both decorators reached this target. The one that ran first may have
    // recorded a channel already, so that record is taken back out. Neither
    // declaration can be shown to win, so the target gets no channel at all.
    // The kind is recorded first, so a third application of either decorator
    // is reported as the duplicate it is.
    getChannelStateMap(context.program).delete(target);
    reportDiagnostic(context.program, { code: "conflicting-channel-decorators", target });
    return false;
  }
  return true;
}

/**
 * Lists every channel the program declares, in source order.
 *
 * Channels are collected program-wide. There is no service namespace
 * restriction, so a channel declared anywhere reaches the document. This
 * follows `listMessages` rather than the `@server` rule, because AsyncAPI
 * puts the servers under the application while a channel describes a shared
 * medium that any part of the program may name.
 *
 * @param program - The program to read the state from
 * @returns The declarations, each with its target, in source order
 */
export function listChannelsInternal(
  program: Program,
): { target: ChannelTarget; record: ChannelRecord }[] {
  const declared: { target: ChannelTarget; record: ChannelRecord }[] = [];
  for (const [target, record] of getChannelStateMap(program)) {
    declared.push({ target, record });
  }
  const compare = bySourcePosition(program);
  declared.sort((a, b) => compare(a.record, b.record));
  return declared;
}
