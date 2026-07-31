## 1. Data access

- [x] 1.1 Add typed clients for both aggregates, validating the response shape as the health client does
- [x] 1.2 Add a hook that tracks each aggregate independently through loading, loaded, and failed

## 2. Chart

- [x] 2.1 Build the ranked horizontal bar chart: one hue, category and value labelled, no legend
- [x] 2.2 Add the hover and focus tooltip carrying the exact total and its share
- [x] 2.3 Cover the empty and failed states, and prove a failure in one chart leaves the other rendering

## 3. Page

- [x] 3.1 Compose the dashboard: headline total derived from the country aggregate, then both charts
- [x] 3.2 Replace the connectivity shell and remove it
- [x] 3.3 Add the stylesheet: custom properties per colour scheme, and a grid that stacks at a phone width

## 4. Verification

- [x] 4.1 Run the full stack and confirm both charts render real seeded data, in light and dark
