# [Next.js 13](https://beta.nextjs.org/) with [Relay](https://relay.dev/)

## Step by step guide:
> If you run into any problems following step by step guide, check files in this repo.

### 1. Create Next.js project

```bash
npx create-next-app@latest --experimental-app next-13-relay
```

> Here, `next-13-relay` is the name of the app you're creating

```
Need to install the following packages:
  create-next-app@latest
Ok to proceed? (y) y
✔ Would you like to use TypeScript with this project? … No / Yes
✔ Would you like to use ESLint with this project? … No / Yes
```

Reply `yes` to prompts

> Success! Created next-13-relay at </parent/directory>/next-13-relay

### 2. Configure Relay

### 2.1 Install Relay dependencies

```bash
cd next-13-relay
npm install --save relay-runtime@main react-relay@main
npm install --save-dev relay-compiler@main @types/react-relay @types/relay-runtime
```

### 2.2 Configure relay with `relay.config.json`

relay.config.json
```json
{
  "root": ".",
  "excludes": ["**/node_modules/**"],
  "sources": {
      "": "myProject"
  },
  "projects": {
      "myProject": {
          "schema": "schema.graphql",
          "language": "typescript"
      }
  }
}
```

### 2.3 Update next config for relay compilation

next.config.js

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    compiler: {
      relay: {
        src: "./",
        language: "typescript",
        artifactDirectory: "app/__generated__",
      },
    },
  };
  
  module.exports = nextConfig;
```

### 2.4 Get schema.graphql

Here we're using GitHub's graphql API, you can download GitHub's schema using

```bash
curl https://raw.githubusercontent.com/roshanjossey/nextjs-13-relay/main/schema.graphql > schema.graphql
```

### 2.5 Create Relay environment and hooks

Create an `src` directory and a directory named `relay` inside it (`src/relay/`)
Create the [following files](https://github.com/Roshanjossey/nextjs-13-relay/tree/main/src/relay) inside `relay` directory

<details>
<summary>src/relay/environment.ts </summary>

```ts
import {
    Environment,
    Network,
    RecordSource,
    Store,
    RequestParameters,
    QueryResponseCache,
    Variables,
    GraphQLResponse,
    CacheConfig,
  } from "relay-runtime";
  
  const HTTP_ENDPOINT = "https://api.github.com/graphql";
  const IS_SERVER = typeof window === typeof undefined;
  const CACHE_TTL = 5 * 1000; // 5 seconds, to resolve preloaded results
  
  export async function networkFetch(
    request: RequestParameters,
    variables: Variables
  ): Promise<GraphQLResponse> {
    const token = process.env.NEXT_PUBLIC_REACT_APP_GITHUB_AUTH_TOKEN;
    if (token == null || token === "") {
      throw new Error(
        "This app requires a GitHub authentication token to be configured. See readme.md for setup details."
      );
    }
  
    const resp = await fetch(HTTP_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: request.text,
        variables,
      }),
    });
    const json = await resp.json();
  
    // GraphQL returns exceptions (for example, a missing required variable) in the "errors"
    // property of the response. If any exceptions occurred when processing the request,
    // throw an error to indicate to the developer what went wrong.
    if (Array.isArray(json.errors)) {
      console.error(json.errors);
      throw new Error(
        `Error fetching GraphQL query '${
          request.name
        }' with variables '${JSON.stringify(variables)}': ${JSON.stringify(
          json.errors
        )}`
      );
    }
  
    return json;
  }
  
  export const responseCache: QueryResponseCache | null = IS_SERVER
    ? null
    : new QueryResponseCache({
        size: 100,
        ttl: CACHE_TTL,
      });
  
  function createNetwork() {
    async function fetchResponse(
      params: RequestParameters,
      variables: Variables,
      cacheConfig: CacheConfig
    ) {
      const isQuery = params.operationKind === "query";
      const cacheKey = params.id ?? params.cacheID;
      const forceFetch = cacheConfig && cacheConfig.force;
      if (responseCache != null && isQuery && !forceFetch) {
        const fromCache = responseCache.get(cacheKey, variables);
        if (fromCache != null) {
          return Promise.resolve(fromCache);
        }
      }
  
      return networkFetch(params, variables);
    }
  
    const network = Network.create(fetchResponse);
    return network;
  }
  
  function createEnvironment() {
    return new Environment({
      network: createNetwork(),
      store: new Store(RecordSource.create()),
      isServer: IS_SERVER,
    });
  }
  
  export const environment = createEnvironment();
  
  export function getCurrentEnvironment() {
    if (IS_SERVER) {
      return createEnvironment();
    }
  
    return environment;
  }
```

</details>

<details>
<summary>src/relay/loadSerializableQuery.ts </summary>

```ts
import {
    GraphQLResponse,
    OperationType,
    RequestParameters,
    VariablesOf,
  } from "relay-runtime";
  import { ConcreteRequest } from "relay-runtime/lib/util/RelayConcreteNode";
  import { networkFetch } from "./environment";
  
  export interface SerializablePreloadedQuery<
    TRequest extends ConcreteRequest,
    TQuery extends OperationType
  > {
    params: TRequest["params"];
    variables: VariablesOf<TQuery>;
    response: GraphQLResponse;
  }
  
  // Call into raw network fetch to get serializable GraphQL query response
  // This response will be sent to the client to "warm" the QueryResponseCache
  // to avoid the client fetches.
  export default async function loadSerializableQuery<
    TRequest extends ConcreteRequest,
    TQuery extends OperationType
  >(
    params: RequestParameters,
    variables: VariablesOf<TQuery>
  ): Promise<SerializablePreloadedQuery<TRequest, TQuery>> {
    const response = await networkFetch(params, variables);
    return {
      params,
      variables,
      response,
    };
  }
```
</details>
<details>
<summary> src/relay/useSerializablePreloadedQuery.ts</summary>

```ts
// Convert preloaded query object (with raw GraphQL Response) into
// Relay's PreloadedQuery.

import { useMemo } from "react";
import { PreloadedQuery, PreloadFetchPolicy } from "react-relay";
import { ConcreteRequest, IEnvironment, OperationType } from "relay-runtime";
import { responseCache } from "./environment";
import { SerializablePreloadedQuery } from "./loadSerializableQuery";

// This hook convert serializable preloaded query
// into Relay's PreloadedQuery object.
// It is also writes this serializable preloaded query
// into QueryResponseCache, so we the network layer
// can use these cache results when fetching data
// in `usePreloadedQuery`.
export default function useSerializablePreloadedQuery<
  TRequest extends ConcreteRequest,
  TQuery extends OperationType
>(
  environment: IEnvironment,
  preloadQuery: SerializablePreloadedQuery<TRequest, TQuery>,
  fetchPolicy: PreloadFetchPolicy = "store-or-network"
): PreloadedQuery<TQuery> {
  useMemo(() => {
    writePreloadedQueryToCache(preloadQuery);
  }, [preloadQuery]);

  return {
    environment,
    fetchKey: preloadQuery.params.id ?? preloadQuery.params.cacheID,
    fetchPolicy,
    isDisposed: false,
    name: preloadQuery.params.name,
    kind: "PreloadedQuery",
    variables: preloadQuery.variables,
    dispose: () => {
      return;
    },
  };
}

function writePreloadedQueryToCache<
  TRequest extends ConcreteRequest,
  TQuery extends OperationType
>(preloadedQueryObject: SerializablePreloadedQuery<TRequest, TQuery>) {
  const cacheKey =
    preloadedQueryObject.params.id ?? preloadedQueryObject.params.cacheID;
  responseCache?.set(
    cacheKey,
    preloadedQueryObject.variables,
    preloadedQueryObject.response
  );
}
```
</details>


### 2.6 Update index page to use relay
Change `app/page.tsx` as follows:

```tsx
import loadSerializableQuery from "../src/relay/loadSerializableQuery";
import MainViewQueryNode, {
  MainViewQuery,
} from "./__generated__/MainViewQuery.graphql";
import MainViewClientComponent from "./MainView";

const Page = async () => {
  const preloadedQuery = await loadSerializableQuery<
    typeof MainViewQueryNode,
    MainViewQuery
  >(MainViewQueryNode.params, {
    owner: "firstcontributions",
    name: "first-contributions",
  });

  return (
    <div>
      <MainViewClientComponent preloadedQuery={preloadedQuery} />
    </div>
  );
};

export default Page;

export const revalidate = 0;
```

Also add
app/MainView.tsx 

```tsx
"use client";

import { Suspense } from "react";
import { SerializablePreloadedQuery } from "../src/relay/loadSerializableQuery";
import MainViewQueryNode, {
  MainViewQuery,
} from "./__generated__/MainViewQuery.graphql";
import { getCurrentEnvironment } from "../src/relay/environment";
import { RelayEnvironmentProvider, graphql, PreloadedQuery, usePreloadedQuery } from "react-relay";
import useSerializablePreloadedQuery from "../src/relay/useSerializablePreloadedQuery";
import Link from "next/link";

const MainViewClientComponent = (props: {
  preloadedQuery: SerializablePreloadedQuery<
    typeof MainViewQueryNode,
    MainViewQuery
  >;
}) => {
  const environment = getCurrentEnvironment();
  const queryRef = useSerializablePreloadedQuery(
    environment,
    props.preloadedQuery
  );

  return (
    <RelayEnvironmentProvider environment={environment}>
      <Suspense fallback="Loading...">
        <MainView queryRef={queryRef} />
      </Suspense>
    </RelayEnvironmentProvider>
  );
};

function MainView(props: {
    queryRef: PreloadedQuery<MainViewQuery>;
  }) {
    const data = usePreloadedQuery(
      graphql`
        query MainViewQuery($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            nameWithOwner
            description
            url
          }
        }
      `,
      props.queryRef
    );
  
    return (
      <div>
        <h1>
          {data.repository?.nameWithOwner}
        </h1>
        <span>{data.repository?.description}</span>
        <div>
        <span><strong><Link href={data.repository?.url}>Link</Link></strong></span>
        </div>
      </div>
    );
  }

export default MainViewClientComponent;
```


### 2.7 Add script for relay

In scripts in your package.json, add a script called relay

```json
  "scripts": {
    ...,
    "relay": "relay-compiler"
  },
```
Now, you can run `yarn relay` from your console. That'll generate artifacts in `__generated__` directory

### 2.8 Setup `.env` for authentication

[`src/relay/environment.ts`](https://github.com/Roshanjossey/nextjs-13-relay/blob/main/src/relay/environment.ts) requires an environment variable `NEXT_PUBLIC_REACT_APP_GITHUB_AUTH_TOKEN` for GitHub graphql API Auth.

Create `.env` in the root of your project. [Get a personal access token with your GitHub account ](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-personal-access-token-classic)

.env
```env
NEXT_PUBLIC_REACT_APP_GITHUB_AUTH_TOKEN=<token you create above>
```

### 3. Run the app in local

In your console, run `npm run dev`

You should see the app running in `http://localhost:3000`