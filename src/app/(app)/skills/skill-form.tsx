import type { Skill, SkillVersion } from "@/db/schema";
import { SubmitButton } from "@/components/ui/button";

export function SkillForm({ skill, version, action, submitLabel }: { skill: Skill | null; version: SkillVersion | null; action: (fd: FormData) => Promise<void>; submitLabel: string }) {
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required minLength={2} defaultValue={skill?.name ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="purpose">Purpose</label><input id="purpose" name="purpose" required minLength={2} defaultValue={skill?.purpose ?? ""} className="input" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="instructions">Instructions (the procedure, step by step)</label><textarea id="instructions" name="instructions" required defaultValue={version?.instructions ?? ""} className="textarea min-h-[12rem]" /></div>
      <div><label className="label" htmlFor="inputs">Required inputs</label><input id="inputs" name="inputs" defaultValue={version?.inputs ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="outputs">Expected output</label><input id="outputs" name="outputs" defaultValue={version?.outputs ?? ""} className="input" /></div>
      <div><label className="label" htmlFor="requiredTools">Required tools (comma-separated connector keys)</label><input id="requiredTools" name="requiredTools" defaultValue={version?.requiredTools.join(", ") ?? ""} className="input" placeholder="e.g. task_system" /></div>
      <div><label className="label" htmlFor="changeNote">Change note</label><input id="changeNote" name="changeNote" className="input" placeholder={skill ? "What changed in this version" : "Initial version"} /></div>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton>{submitLabel}</SubmitButton></div>
    </form>
  );
}
