/** Same-response metadata only. A record never grants native IO, execution or approval. */
export interface PrelayoutRecordBase {
  jobId:string; projectId:string; taskCardId:string; sourceTupleHash:string; baseInputSha256:string;
  relation:'same_inputs'|'historical_inputs'; physicalOriginalsVerified:false; executionEligible:false;
  humanApproval:false; finalReviewApproval:false; method:{version:string;sha256:string};
}
export interface PrelayoutAttemptRecord {
  id:string; status:'running'|'awaiting_reconciliation'|'succeeded'|'succeeded_stale'; startedAt:string;
  actorId:string; requestHash:string; error:{code:string;message:string}|null;
}
export type PrelayoutReadRecord=PrelayoutRecordBase&(
  |{kind:'queued';status:'queued';attempt:null;report:null}
  |{kind:'attempt';status:'running'|'awaiting_reconciliation';attempt:PrelayoutAttemptRecord;report:null}
  |{kind:'reported';status:'succeeded'|'succeeded_stale';attempt:PrelayoutAttemptRecord;
    report:{id:string;status:'clear'|'returned'|'unresolved'|'invalid_report'|'stale';sha256:string;originalText:string;modelDecision:'clear'|'return'|'unknown'|null;summary:string|null}}
);
