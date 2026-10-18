export const STARTUP_FACTS_V1_PROFILE = "startup_facts_v1" as const;

/** Parallel Task output schema for PRD §7.1. Nullable leaves mean "unknown" (→ unanswered, never fabricated). */
export const STARTUP_FACTS_V1_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["company_name", "official_website", "headquarters", "founding_year", "founders", "latest_funding"],
  properties: {
    company_name: { type: "string", description: "Echo of the input company_name, unchanged." },
    official_website: {
      type: ["string", "null"],
      description: "Official company website URL as of input.as_of_date, or null if unknown.",
    },
    headquarters: {
      type: ["string", "null"],
      description: "Headquarters as 'City, State/Region, Country' as of input.as_of_date, or null if unknown.",
    },
    founding_year: { type: ["integer", "null"], description: "Year the company was founded, or null if unknown." },
    founders: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "Full names of the company's founders, or null if unknown. Do not guess.",
    },
    latest_funding: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["round", "amount_usd", "announced_on"],
      description:
        "Latest publicly announced financing round on or before input.as_of_date, or null if none is known. Exclude acquisitions and non-financing transactions.",
      properties: {
        round: { type: ["string", "null"], description: "Round name, e.g. 'Seed', 'Series A'." },
        amount_usd: { type: ["number", "null"], description: "Amount raised in US dollars, or null if undisclosed." },
        announced_on: { type: ["string", "null"], description: "Announcement date as YYYY-MM-DD, or null." },
      },
    },
  },
} as const;
