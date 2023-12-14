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