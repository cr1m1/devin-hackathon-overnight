import { customAlphabet } from "nanoid";

// Plan §6: text ids, nanoid(12) with a type prefix so ids are readable in logs.
const alphabet = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

export const newRunId = () => `run_${alphabet()}`;
export const newStageId = () => `stg_${alphabet()}`;
export const newScheduleId = () => `sch_${alphabet()}`;
