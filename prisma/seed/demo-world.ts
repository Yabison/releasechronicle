import type { HierarchySeed } from "./hierarchy";

/**
 * The demo world: a fictional company whose release activity exercises every
 * feature the UI can show, so a visitor meets each badge and alert at least once.
 *
 * Yabison is public end to end. Kaleido is deliberately private, and SANDBOX is a
 * private environment inside a public company — together they make the public-mode
 * rules visible rather than theoretical.
 *
 * "Release Chronicle" is this project itself, seeded from its real git history
 * (prisma/seed/release-chronicle-history.json). It is the one product in the demo
 * whose events are not invented.
 */
export const DEMO_HIERARCHY: HierarchySeed = {
  environments: [
    { slug: "DEV", color: "#94a3b8", public: true },
    { slug: "QA", color: "#3b82f6", public: true },
    { slug: "STAGING", color: "#f97316", public: true },
    { slug: "PROD", color: "#22c55e", public: true },
    // Private on purpose: proves an anonymous visitor sees a filtered timeline.
    { slug: "SANDBOX", color: "#8b5cf6", public: false },
  ],
  environmentGroups: [
    { slug: "preprod", name: "PREPROD", members: ["DEV", "QA", "STAGING"] },
  ],
  companies: [
    {
      name: "Yabison",
      public: true,
      products: [
        {
          name: "Tatanka",
          master: "Tatanka",
          envWorkflow: ["DEV", "QA", "STAGING", "PROD"],
          buildUrlTemplate: "https://build.yabison.example/tatanka/{version}",
          services: ["Tatanka", "TatankaAuth", "TatankaBilling", "TatankaSearch", "TatankaGateway"],
        },
        {
          name: "ayaní",
          master: "ayaní",
          envWorkflow: ["QA", "STAGING", "PROD"],
          services: ["ayaní", "ayaníIngest", "ayaníWarehouse"],
        },
        {
          name: "iinnii",
          master: "iinnii",
          envWorkflow: ["QA", "PROD"],
          services: ["iinnii"],
        },
        {
          name: "Release Chronicle",
          master: "ReleaseChronicle",
          envWorkflow: ["DEV", "QA", "PROD"],
          services: ["ReleaseChronicle"],
        },
      ],
    },
    {
      // Private company: invisible to anonymous visitors, in the API as well as the UI.
      name: "Kaleido",
      public: false,
      products: [
        {
          name: "Prism",
          master: "Prism",
          envWorkflow: ["QA", "PROD"],
          services: ["Prism", "PrismRender"],
        },
      ],
    },
  ],
};

/** Deployment requesters, so the demo shows a plausible team rather than one name. */
export const DEMO_PEOPLE = [
  "camille.roy", "sam.okafor", "noor.haddad", "lena.fischer",
  "tomas.silva", "ines.moreau", "kai.andersen", "ruth.nakamura",
];

export const DEMO_TAGS = ["canary", "hotfix", "db-migration", "feature-flag", "rollback", "security"];
