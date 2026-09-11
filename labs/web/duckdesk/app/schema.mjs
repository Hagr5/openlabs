import { gql } from 'graphql-tag';

export const typeDefs = gql`
  enum Role {
    AGENT
    ADMIN
  }

  enum TicketStatus {
    OPEN
    IN_PROGRESS
    RESOLVED
  }

  type ServiceStatus {
    version: String!
    uptimeSeconds: Float!
  }

  type TeamMember {
    displayName: String!
    department: String!
    roleLabel: String!
  }

  type TeamStats {
    headcount: Int!
  }

  type AgentConnection {
    agents: [Agent!]!
    pageInfo: PageInfo!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type Agent {
    id: ID!
    displayName: String!
    email: String!
    role: Role!
    department: String!
    isActive: Boolean!
    hireDate: String!
    lastLoginAt: String
  }

  type Viewer {
    id: ID!
    displayName: String!
    email: String!
    role: Role!
    department: String!
  }

  type ArticleConnection {
    articles: [Article!]!
    pageInfo: PageInfo!
  }

  type Article {
    slug: String!
    title: String!
    body: String!
    category: String!
    updatedAt: String!
  }

  type Ticket {
    id: ID!
    subject: String!
    body: String!
    status: TicketStatus!
    priority: Int!
    creatorId: ID!
    assigneeId: ID
    comments: [Comment!]!
    createdAt: String!
  }

  type Comment {
    id: ID!
    authorId: ID!
    body: String!
    createdAt: String!
  }

  type VaultEntry {
    key: String!
    value: String!
  }

  input StringFilter {
    eq: String
    ne: String
    contains: String
    startsWith: String
    endsWith: String
  }

  input RoleFilter {
    eq: Role
  }

  input AgentFilter {
    displayName: StringFilter
    email: StringFilter
    department: StringFilter
    role: RoleFilter
    isActive: Boolean
    hiredAfter: DateTime
    hiredBefore: DateTime
    passwordHash: StringFilter
  }

  input LoginInput {
    email: String!
    password: String!
  }

  type AuthPayload {
    token: String!
    viewer: Viewer
  }

  input CreateTicketInput {
    subject: String!
    body: String!
    priority: Int!
  }

  input AddCommentInput {
    ticketId: ID!
    body: String!
  }

  input UpdateTicketStatusInput {
    ticketId: ID!
    status: TicketStatus!
  }

  input ChangePasswordInput {
    oldPassword: String!
    newPassword: String!
  }

  scalar DateTime

  type Query {
    serviceStatus: ServiceStatus!
    articles(category: String, first: Int, after: String): ArticleConnection!
    article(slug: String!): Article
    teamPage: [TeamMember!]!
    teamStats(filter: AgentFilter): TeamStats!
    viewer: Viewer
    tickets(status: TicketStatus, first: Int, after: String): TicketConnection!
    ticket(id: ID!): Ticket
    agents(filter: AgentFilter, first: Int, after: String): AgentConnection!
    vault: [VaultEntry!]!
  }

  type Mutation {
    login(input: LoginInput!): AuthPayload!
    createTicket(input: CreateTicketInput!): Ticket!
    addComment(input: AddCommentInput!): Comment!
    updateTicketStatus(input: UpdateTicketStatusInput!): Ticket!
    changeMyPassword(input: ChangePasswordInput!): Boolean!
  }

  type TicketConnection {
    tickets: [Ticket!]!
    pageInfo: PageInfo!
  }
`;
