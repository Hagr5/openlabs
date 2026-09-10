"use strict";

module.exports = /* GraphQL */ `
  "A code file attached to an account function."
  union CodeFile = StagedFile | UploadedFile

  "Upload link for a function package that has not been uploaded yet."
  type StagedFile {
    uploadLink: String!
  }

  "Reference to a package file that has been uploaded."
  type UploadedFile {
    fileName: String!
  }

  enum FunctionStatus {
    PENDING_PACKAGE_UPLOAD
    PROVISIONING
    READY
    FAILED
  }

  "Resource types supported by account webhooks (preview)."
  enum ResourceType {
    USER
  }

  "Resource actions supported by account webhooks (preview)."
  enum ResourceAction {
    CHANGED
  }

  "A serverless function owned by an account in the Functions preview."
  type AccountFunction {
    id: ID!
    name: String!
    active: Boolean!
    status: FunctionStatus!
    "Runtime identifier assigned when the function is READY."
    runtime: String
    codeFile: CodeFile
    lastInvocation: FunctionInvocation
  }

  type FunctionInvocation {
    id: ID!
    successful: Boolean!
    startedOn: DateTime!
    endedOn: DateTime
    error: String
    logs: [LogEntry!]!
  }

  type LogEntry {
    timestamp: DateTime!
    message: String!
  }

  type WebhookConfiguration {
    id: ID!
    status: String!
    resourceType: ResourceType!
    resourceActions: [ResourceAction!]!
    destination: WebhookDestination
    lastDelivery: DeliveryRecord
  }

  type WebhookDestination {
    functionId: ID
  }

  type DeliveryRecord {
    id: ID!
    invocation: FunctionInvocation
  }

  type UserError {
    message: String!
    path: [String!]
  }

  type Query {
    "The currently authenticated user."
    viewer: Viewer
    "Fetch one of the account's functions."
    function(id: ID!): AccountFunction
    functions(first: Int, after: String): FunctionConnection!
    webhookConfigurations(first: Int, after: String): WebhookConfigurationConnection!
  }

  type Viewer {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    locale: String!
    role: UserRole!
  }

  enum UserRole {
    ROLE_USER
    ROLE_ADMIN
  }

  type FunctionConnection {
    edges: [FunctionEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type FunctionEdge {
    node: AccountFunction!
    cursor: String!
  }

  type WebhookConfigurationConnection {
    edges: [WebhookConfigurationEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type WebhookConfigurationEdge {
    node: WebhookConfiguration!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  input CreateAccountFunctionInput {
    name: String!
    codeFileName: String!
    active: Boolean
  }

  type CreateAccountFunctionPayload {
    accountFunction: AccountFunction
    userErrors: [UserError!]!
  }

  type DeleteAccountFunctionPayload {
    id: ID
    userErrors: [UserError!]!
  }

  type InvokeFunctionPayload {
    invocation: FunctionInvocation
    userErrors: [UserError!]!
  }

  input CreateAccountWebhookConfigurationInput {
    resourceType: ResourceType!
    resourceActions: [ResourceAction!]!
    destination: WebhookDestinationInput
  }

  input WebhookDestinationInput {
    functionId: ID
  }

  type CreateAccountWebhookConfigurationPayload {
    webhookConfiguration: WebhookConfiguration
    userErrors: [UserError!]!
  }

  type DeleteAccountWebhookConfigurationPayload {
    id: ID
    userErrors: [UserError!]!
  }

  "ISO-8601 timestamp."
  scalar DateTime

  type Mutation {
    "Create a new account function. The package upload link is returned in codeFile."
    createAccountFunction(
      input: CreateAccountFunctionInput!
    ): CreateAccountFunctionPayload!
    deleteAccountFunction(id: ID!): DeleteAccountFunctionPayload!
    "Invoke one of the account's functions directly. Requires the Functions pilot entitlement."
    invokeFunction(id: ID!): InvokeFunctionPayload!
    createAccountWebhookConfiguration(
      input: CreateAccountWebhookConfigurationInput!
    ): CreateAccountWebhookConfigurationPayload!
    deleteAccountWebhookConfiguration(
      id: ID!
    ): DeleteAccountWebhookConfigurationPayload!
  }
`;
