import * as Sentry from "@sentry/tanstackstart-react";

Sentry.init({
  dsn: "https://485413529139d7a22d373108cfd7c87e@o4507578256588800.ingest.us.sentry.io/4510344189706240",

  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});