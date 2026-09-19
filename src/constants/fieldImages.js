import biobuzzField from "../assets/biobuzz_field.webp";
import decodeField from "../assets/decode_field.png";

// Season field renders. Both are 1080x1080 and share the same frame
// (from the Pedro Pathing Visualizer, Apache-2.0).
export const FIELD_IMAGE_OPTIONS = [
    {key: "biobuzz", label: "BIOBUZZ (2026-27)", src: biobuzzField},
    {key: "decode", label: "DECODE (2025-26)", src: decodeField},
];

export const FIELD_IMAGE_KEYS = FIELD_IMAGE_OPTIONS.map((option) => option.key);

export const resolveFieldImageKey = (key, fallback = "biobuzz") =>
    FIELD_IMAGE_KEYS.includes(key) ? key : FIELD_IMAGE_KEYS.includes(fallback) ? fallback : FIELD_IMAGE_KEYS[0];

export const getFieldImageSrc = (key) =>
    (FIELD_IMAGE_OPTIONS.find((option) => option.key === resolveFieldImageKey(key)) || FIELD_IMAGE_OPTIONS[0]).src;
