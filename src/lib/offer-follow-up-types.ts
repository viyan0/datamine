export const businessChatOfferModes = ['immediate', 'businessFirst'] as const;
export type BusinessChatOfferMode = (typeof businessChatOfferModes)[number];
// A business gets this long to answer a customer before Datamine follows up.
export const followUpDelayHours = 6;
