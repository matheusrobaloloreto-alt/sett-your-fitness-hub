import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  bnContentRecord,
  isUsableBnContentSpec,
  validateBnContentSpec,
} from "../_shared/bnContent.ts";
import type { BnStudioCalendar, BnStudioPost } from "../_shared/bnContent.ts";
import { StudioError } from "./handler.ts";
import type { SaveInput, StudioStore } from "./handler.ts";

const postColumns = "id,brief,spec,status,version,created_at,updated_at";
const calendarColumns = "id,calendar,created_at";
const bucket = "bn-content-studio";
function databaseError(error: unknown) {
  if (!error) return;
  const code = bnContentRecord(error) ? error.code : undefined;
  if (code === "40001") throw new StudioError(409, "version_conflict");
  if (code === "42501") throw new StudioError(403, "forbidden");
  if (code === "22023" || code === "23514") {
    throw new StudioError(400, "invalid_request");
  }
  throw new StudioError(500, "storage_unavailable");
}
function postValue(value: unknown): BnStudioPost {
  if (
    !bnContentRecord(value) || typeof value.id !== "string" ||
    !validateBnContentSpec(value.spec) ||
    typeof value.brief !== "string" ||
    !["draft", "approved"].includes(value.status as string) ||
    !Number.isInteger(value.version) || typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string"
  ) throw new StudioError(500, "invalid_storage_response");
  const { id, brief, spec, status, version, created_at, updated_at } = value;
  return {
    id,
    brief,
    spec,
    status,
    version,
    created_at,
    updated_at,
  } as BnStudioPost;
}
function calendarValue(value: unknown): BnStudioCalendar {
  if (
    !bnContentRecord(value) || typeof value.id !== "string" ||
    !bnContentRecord(value.calendar) ||
    typeof value.created_at !== "string"
  ) throw new StudioError(500, "invalid_storage_response");
  return {
    id: value.id,
    calendar: value.calendar,
    created_at: value.created_at,
  };
}

export function createStudioStore(client: SupabaseClient): StudioStore {
  return {
    async posts() {
      const rows: BnStudioPost[] = [];
      for (let offset = 0;; offset += 200) {
        const { data, error } = await client.from("bn_content_studio_posts")
          .select(postColumns)
          .order("updated_at", { ascending: false }).order("id").range(
            offset,
            offset + 199,
          );
        databaseError(error);
        if (!data) throw new StudioError(500, "storage_unavailable");
        rows.push(...data.map(postValue));
        if (data.length < 200) return rows;
      }
    },
    async calendars() {
      const rows: BnStudioCalendar[] = [];
      for (let offset = 0;; offset += 200) {
        const { data, error } = await client.from("bn_content_studio_calendars")
          .select(calendarColumns)
          .order("created_at", { ascending: false }).order("id").range(
            offset,
            offset + 199,
          );
        databaseError(error);
        if (!data) throw new StudioError(500, "storage_unavailable");
        rows.push(...data.map(calendarValue));
        if (data.length < 200) return rows;
      }
    },
    async approvedExamples() {
      const { data, error } = await client.from("bn_content_studio_posts")
        .select("spec")
        .eq("status", "approved").order("updated_at", { ascending: false })
        .order("id").limit(3);
      databaseError(error);
      return (data ?? []).map((p) => p.spec).filter((s) =>
        validateBnContentSpec(s) && isUsableBnContentSpec(s)
      );
    },
    async post(id: string) {
      const { data, error } = await client.from("bn_content_studio_posts")
        .select(postColumns).eq("id", id).maybeSingle();
      databaseError(error);
      return data ? postValue(data) : null;
    },
    async save(actor: string, input: SaveInput) {
      const { data, error } = await client.rpc("bn_content_studio_save", {
        p_actor: actor,
        p_id: input.id ?? null,
        p_expected_version: input.expected_version ?? null,
        p_brief: input.brief,
        p_spec: input.spec,
        p_status: input.status,
      });
      databaseError(error);
      return postValue(data);
    },
    async calendar(actor: string, calendar: unknown) {
      const { data, error } = await client.from("bn_content_studio_calendars")
        .insert({ calendar, created_by: actor }).select(calendarColumns)
        .single();
      databaseError(error);
      return calendarValue(data);
    },
    async quota(actor: string, kind: "text" | "image") {
      const { data, error } = await client.rpc("bn_content_studio_take_quota", {
        p_actor: actor,
        p_kind: kind,
      });
      databaseError(error);
      if (typeof data !== "boolean") {
        throw new StudioError(500, "quota_unavailable");
      }
      return data;
    },
    async signedAssets(paths: string[]) {
      const result: Record<string, string> = {};
      for (let offset = 0; offset < paths.length; offset += 100) {
        const batch = paths.slice(offset, offset + 100);
        const { data, error } = await client.storage.from(bucket)
          .createSignedUrls(batch, 3600);
        databaseError(error);
        if (!data || data.length !== batch.length) {
          throw new StudioError(500, "asset_signing_failed");
        }
        for (const item of data) {
          if (
            item.error || !item.path || !item.signedUrl ||
            !batch.includes(item.path)
          ) throw new StudioError(500, "asset_signing_failed");
          result[item.path] = item.signedUrl;
        }
      }
      return result;
    },
    async upload(path: string, bytes: Uint8Array, mime: string) {
      const { error } = await client.storage.from(bucket).upload(path, bytes, {
        contentType: mime,
        upsert: false,
        cacheControl: "3600",
      });
      databaseError(error);
    },
  };
}
