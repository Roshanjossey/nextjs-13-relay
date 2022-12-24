import loadSerializableQuery from "src/relay/loadSerializableQuery";
import IssueQueryNode, { IssueQuery } from "__generated__/IssueQuery.graphql";
import IssueViewClientComponent from "./IssueViewClientComponent";

export default async function IssuePage({
  params,
}: {
  params: { id: string };
}) {
  const preloadedQuery = await loadSerializableQuery<
    typeof IssueQueryNode,
    IssueQuery
  >(IssueQueryNode.params, {
    owner: "firstcontributions",
    name: "first-contributions",
    issueNumber: parseInt(params.id, 10),
  });

  return (
    <div>
      <IssueViewClientComponent preloadedQuery={preloadedQuery} />
    </div>
  );
}
