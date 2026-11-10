import type { CSSProperties } from "react";
import styles from "./office-character.module.css";
import actorStyles from "./office-actor.module.css";

export type OfficeCharacterMotion = "typing" | "reviewing" | "waiting" | "none";
type CharacterKind = "operations" | "library" | "sales" | "marketing" | "creative" | "developer" | "support";

const PALETTES = {
  operations: ["--accent-2", "--accent-2-soft"],
  library: ["--amber", "--amber-soft"],
  sales: ["--blue", "--blue-soft"],
  marketing: ["--rose", "--rose-soft"],
  creative: ["--violet", "--violet-soft"],
  developer: ["--emerald", "--emerald-soft"],
  support: ["--accent-2", "--accent-2-soft"],
} as const;

function characterKind(role: string, department: string): CharacterKind {
  const value = `${role} ${department}`.toLowerCase();
  if (/librar|knowledge|research/.test(value)) return "library";
  if (/sales|revenue|business development/.test(value)) return "sales";
  if (/support|customer|success/.test(value)) return "support";
  if (/creative|design|art director/.test(value)) return "creative";
  if (/market|content|social/.test(value)) return "marketing";
  if (/develop|engineer|delivery|technical/.test(value)) return "developer";
  return "operations";
}

function seedNumber(value: string) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Decorative station. Its enclosing button owns the name, status and action label.
 * Motion is opt-in: the scene distinguishes recorded work from decorative previews.
 * The component never infers activity from a role. */
export function OfficeCharacter({ seed, name, roleTitle, departmentSlug, motion = "none", size = 112 }: {
  seed: string;
  name: string;
  roleTitle: string;
  departmentSlug: string;
  motion?: OfficeCharacterMotion;
  size?: number;
}) {
  const kind = characterKind(roleTitle, departmentSlug);
  const variant = seedNumber(seed || name);
  const [color, soft] = PALETTES[kind];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size * 132 / 128}
      viewBox="0 0 128 132"
      className={styles.character}
      data-motion={motion}
      data-character={kind}
      style={{ "--character-color": `var(${color})`, "--character-soft": `var(${soft})` } as CSSProperties}
    >
      <ellipse cx="64" cy="122" rx="47" ry="7" fill="var(--ink)" opacity="0.09" />
      {/* A compact upholstered task chair, trousers and oversized companion shoes. */}
      <rect x="43" y="66" width="42" height="40" rx="15" fill="var(--line-strong)" />
      <path d="M53 98 50 117M73 98 77 117" stroke="var(--slate)" strokeWidth="11" strokeLinecap="round" />
      <path d="M49 118h-8m37 0h9" stroke="var(--character-color)" strokeWidth="10" strokeLinecap="round" />
      <g className={styles.body}>
        <path d="M43 77q0-15 21-15t21 15v21H43Z" fill="var(--character-color)" />
        <path d="m55 65 9 9 9-9-9 29Z" fill="var(--character-soft)" />
        <path d="M64 76v19" stroke="var(--character-color)" strokeWidth="2" opacity="0.5" />
        <rect x="73" y="76" width="7" height="9" rx="2" fill="var(--character-soft)" />
        <path d="M75 79h3m-3 3h2" stroke="var(--character-color)" strokeWidth="1.2" />
        <CharacterHead kind={kind} variant={variant} />
      </g>
      {/* Station silhouette anchors each figure to the room rather than floating. */}
      <path d="M28 99v20m72-20v20" stroke="var(--line-strong)" strokeWidth="4" strokeLinecap="round" />
      <path d="m22 86 82 0 10 12H14Z" fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M16 99h96" stroke="var(--line-strong)" strokeWidth="4" strokeLinecap="round" />
      <g className={styles.leftArm}>
        <path d="M44 74 35 84l16 5" fill="none" stroke="var(--character-color)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <ellipse cx="52" cy="89" rx="6" ry="4" fill="var(--character-soft)" stroke="var(--character-color)" strokeWidth="1.4" />
      </g>
      <g className={styles.rightArm}>
        <path d="m84 74 9 10-16 5" fill="none" stroke="var(--character-color)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <ellipse cx="76" cy="89" rx="6" ry="4" fill="var(--character-soft)" stroke="var(--character-color)" strokeWidth="1.4" />
      </g>
      {kind === "library" || motion === "reviewing" ? (
        <g className={styles.page}>
          <path d="M43 77q10-3 21 2 11-5 21-2l-2 16q-10-2-19 2-9-4-19-2Z" fill="var(--surface)" stroke="var(--character-color)" strokeWidth="1.7" />
          <path d="M64 79v15m-16-12 11 2m-10 2 10 2m10-4 10-2m-10 6 9-2" fill="none" stroke="var(--character-color)" strokeWidth="1.3" opacity="0.7" />
        </g>
      ) : (
        <g>
          <path d="M43 92 40 74q0-3 3-3h42q3 0 3 3l-3 18Z" fill="var(--slate)" stroke="var(--line-strong)" strokeWidth="1" />
          <path d="M43 94h42" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" />
          <rect x="45" y="75" width="38" height="14" rx="2" fill="var(--character-soft)" />
          <g className={styles.screenLines} stroke="var(--character-color)" strokeWidth="1.7" strokeLinecap="round"><path d="M49 79h10m4 0h9M49 83h6m4 0h18M49 87h16" /></g>
        </g>
      )}
      <RoleProp kind={kind} />
    </svg>
  );
}

function RoleProp({ kind }: { kind: CharacterKind }) {
  if (kind === "operations") return <g transform="rotate(-12 24 82)"><rect x="15" y="71" width="15" height="21" rx="3" fill="var(--character-soft)" stroke="var(--character-color)" strokeWidth="1.5" /><rect x="19" y="69" width="7" height="4" rx="1" fill="var(--character-color)" /><path d="m18 78 2 2 3-4m1 3h3m-9 6h9m-9 4h7" fill="none" stroke="var(--character-color)" strokeWidth="1.2" /></g>;
  if (kind === "library") return <g><rect x="93" y="85" width="18" height="5" rx="1.5" fill="var(--amber)" /><rect x="95" y="80" width="14" height="5" rx="1.5" fill="var(--character-soft)" stroke="var(--amber)" /></g>;
  if (kind === "creative") return <g><path d="m100 81 5-15" stroke="var(--amber)" strokeWidth="3" strokeLinecap="round" /><path d="m103 68 3-9q6 8 0 10Z" fill="var(--violet)" /><path d="M94 79h13l-2 13h-9Z" fill="var(--violet-soft)" stroke="var(--violet)" strokeWidth="1.5" /></g>;
  if (kind === "marketing") return <g><rect x="97" y="73" width="12" height="19" rx="3" fill="var(--rose-soft)" stroke="var(--rose)" strokeWidth="1.5" /><path d="m101 78 5 3-5 3Z" fill="var(--rose)" /><path d="M101 88h4" stroke="var(--rose)" /></g>;
  return <g><path d="M95 81h10v10H95Z" fill="var(--character-soft)" stroke="var(--character-color)" strokeWidth="1.5" /><path d="M105 83q8-1 4 5h-4" fill="none" stroke="var(--character-color)" strokeWidth="1.5" />{kind === "support" ? <path d="M97 84q2-3 3 0 2-3 3 0 0 2-3 4-3-2-3-4" fill="var(--rose)" /> : <path d="M98 85h4m-4 3h2" stroke="var(--character-color)" strokeWidth="1.3" />}</g>;
}

function CharacterHead({ kind, variant }: { kind: CharacterKind; variant: number }) {
  const headset = kind === "sales" || kind === "support" || kind === "marketing";
  const glasses = kind === "library" || kind === "developer";
  return (
        <g className={styles.head}>
          <path d={variant % 2 ? "M64 24v-9l7-4" : "M64 24v-9l-7-4"} fill="none" stroke="var(--character-color)" strokeWidth="3" strokeLinecap="round" />
          <circle cx={variant % 2 ? 72 : 56} cy="11" r="3.5" fill="var(--character-color)" />
          <rect x="34" y="38" width="9" height="16" rx="4" fill="var(--character-color)" />
          <rect x="85" y="38" width="9" height="16" rx="4" fill="var(--character-color)" />
          <rect x="39" y="24" width="50" height="43" rx={variant % 3 === 0 ? 15 : 20} fill="var(--character-soft)" stroke="var(--character-color)" strokeWidth="2" />
          <path d="M48 32q8-5 17-3" fill="none" stroke="var(--surface)" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
          <rect x="44" y="36" width="40" height="22" rx="10" fill="var(--surface)" />
          <g className={styles.eyes} fill="var(--character-color)">
            <rect x="52" y="42" width="4" height="7" rx="2" />
            <rect x="72" y="42" width="4" height="7" rx="2" />
          </g>
          <path d={kind === "support" ? "M59 51q5 6 10 0" : "M61 52q3 3 6 0"} stroke="var(--character-color)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {glasses && <g fill="none" stroke="var(--slate)" strokeWidth="1.6"><rect x="47" y="39" width="13" height="13" rx="4" /><rect x="68" y="39" width="13" height="13" rx="4" /><path d="M60 44h8" /></g>}
          {headset && <g fill="none" stroke="var(--slate)" strokeWidth="3"><path d="M36 43v-4a28 24 0 0 1 56 0v4" /><rect x="33" y="40" width="6" height="14" rx="3" fill="var(--character-color)" /><rect x="89" y="40" width="6" height="14" rx="3" fill="var(--character-color)" />{kind !== "marketing" && <path d="M92 52q0 9-18 9" strokeWidth="2" />}</g>}
          {kind === "creative" && <g fill="var(--character-color)"><ellipse cx="64" cy="25" rx="27" ry="9" transform="rotate(-9 64 25)" /><path d="m68 18 3-7 4 3-3 6Z" /></g>}
        </g>
  );
}

export type OfficeActorPosture = "walking" | "standing" | "sitting";

/** Person only. Ground anchor is (64,154) in the 128×160 canvas.
 * Keep furniture in the scene so walking never carries a workstation along. */
export function OfficeActor({ seed, name, roleTitle, departmentSlug, posture, motion, facing, size = 90, paused = false }: {
  seed: string;
  name: string;
  roleTitle: string;
  departmentSlug: string;
  posture: OfficeActorPosture;
  motion: OfficeCharacterMotion;
  facing: "left" | "right";
  size?: number;
  paused?: boolean;
}) {
  const kind = characterKind(roleTitle, departmentSlug);
  const variant = seedNumber(seed || name);
  const [color, soft] = PALETTES[kind];
  return <svg aria-hidden="true" focusable="false" width={size} height={size * 160 / 128}
    viewBox="0 0 128 160" className={actorStyles.actor}
    data-character={kind} data-posture={posture} data-motion={motion} data-facing={facing} data-paused={paused}
    style={{ "--character-color": `var(${color})`, "--character-soft": `var(${soft})` } as CSSProperties}>
    <ellipse cx="64" cy="154" rx="26" ry="4" fill="var(--ink)" opacity="0.09" />
    <g className={actorStyles.direction}>
      <g className={actorStyles.leftLeg} data-body-part="left-leg">
        <path className={actorStyles.thigh} d="M55 98v25" stroke="var(--slate)" strokeWidth="12" strokeLinecap="round" />
        <g className={actorStyles.shin}>
          <path d="M55 123v23" stroke="var(--slate)" strokeWidth="10" strokeLinecap="round" />
          <path d="M55 149h-9" stroke="var(--character-color)" strokeWidth="10" strokeLinecap="round" />
        </g>
      </g>
      <g className={actorStyles.rightLeg} data-body-part="right-leg">
        <path className={actorStyles.thigh} d="M73 98v25" stroke="var(--slate)" strokeWidth="12" strokeLinecap="round" />
        <g className={actorStyles.shin}>
          <path d="M73 123v23" stroke="var(--slate)" strokeWidth="10" strokeLinecap="round" />
          <path d="M73 149h9" stroke="var(--character-color)" strokeWidth="10" strokeLinecap="round" />
        </g>
      </g>
      <g className={actorStyles.postureBody}>
        <g className={actorStyles.bob}>
          <path d="M43 77q0-15 21-15t21 15v25H43Z" fill="var(--character-color)" />
          <path d="m55 65 9 9 9-9-9 29Z" fill="var(--character-soft)" />
          <rect x="73" y="76" width="7" height="9" rx="2" fill="var(--character-soft)" />
          <path d="M75 79h3m-3 3h2" stroke="var(--character-color)" strokeWidth="1.2" />
          <g data-identity="head"><CharacterHead kind={kind} variant={variant} /></g>
          <g className={actorStyles.leftArm} data-body-part="left-arm">
            <path d="M44 75 38 91l2 12" fill="none" stroke="var(--character-color)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="40" cy="104" r="5" fill="var(--character-soft)" stroke="var(--character-color)" strokeWidth="1.4" />
          </g>
          <g className={actorStyles.rightArm} data-body-part="right-arm">
            <path d="M84 75 90 91l-2 12" fill="none" stroke="var(--character-color)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="88" cy="104" r="5" fill="var(--character-soft)" stroke="var(--character-color)" strokeWidth="1.4" />
          </g>
          {kind === "library" && <g data-accessory="book" transform="translate(-4 17)"><rect x="30" y="76" width="15" height="20" rx="2" fill="var(--character-soft)" stroke="var(--character-color)" strokeWidth="2" /><path d="M34 77v18m3-13h5m-5 4h5" stroke="var(--character-color)" /></g>}
          {kind === "operations" && <g data-accessory="clipboard" transform="translate(12 19)"><RoleProp kind="operations" /></g>}
        </g>
      </g>
    </g>
  </svg>;
}

/** Static furniture, ground anchor (64,122). Place in front of seated actors. */
export function OfficeDesk({ departmentSlug, size = 110 }: { departmentSlug: string; size?: number }) {
  const kind = characterKind("", departmentSlug);
  const [color, soft] = PALETTES[kind];
  return <svg aria-hidden="true" focusable="false" width={size} height={size * 132 / 128}
    viewBox="0 0 128 132" className={actorStyles.desk} data-furniture="desk"
    style={{ "--character-color": `var(${color})`, "--character-soft": `var(${soft})` } as CSSProperties}>
    <ellipse cx="64" cy="122" rx="47" ry="7" fill="var(--ink)" opacity="0.07" />
    {/* Low chair is behind the tabletop, never a backdrop over the actor's face. */}
    <g data-furniture="chair"><rect x="45" y="95" width="38" height="12" rx="6" fill="var(--line-strong)" /><path d="M64 106v15m-12 0h24" stroke="var(--slate)" strokeWidth="3" strokeLinecap="round" /></g>
    <path d="M28 99v20m72-20v20" stroke="var(--line-strong)" strokeWidth="4" strokeLinecap="round" />
    <path d="m22 86 82 0 10 12H14Z" fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="1.5" />
    <path d="M16 99h96" stroke="var(--line-strong)" strokeWidth="4" strokeLinecap="round" />
    <g data-furniture="laptop"><path d="M43 92 40 74q0-3 3-3h42q3 0 3 3l-3 18Z" fill="var(--slate)" stroke="var(--line-strong)" /><path d="M43 94h42" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" /><rect x="45" y="75" width="38" height="14" rx="2" fill="var(--character-soft)" /><path d="M49 79h10m4 0h9M49 83h6m4 0h18M49 87h16" stroke="var(--character-color)" strokeWidth="1.7" strokeLinecap="round" /></g>
    <RoleProp kind={kind} />
  </svg>;
}
