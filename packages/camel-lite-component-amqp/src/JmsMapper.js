/**
 * JmsMapper — bidirectional mapping between JMS 2.x message properties
 * and AMQP message annotations/properties.
 *
 * JMS 2.x → AMQP 1.0 property names (as used by Qpid JMS / Artemis):
 *   JMSMessageID      ↔  message-id        (application-properties or properties.message_id)
 *   JMSCorrelationID  ↔  correlation-id    (properties.correlation_id)
 *   JMSTimestamp      ↔  creation-time     (properties.creation_time, epoch ms)
 *   JMSType           ↔  subject           (properties.subject)
 *   JMSDeliveryMode   ↔  durable           (header.durable: true = PERSISTENT)
 *   JMSPriority       ↔  priority          (header.priority)
 *   JMSExpiration     ↔  absolute-expiry-time (properties.absolute_expiry_time)
 *
 * For AMQP 0-9-1 (amqplib) the AMQP message properties map is:
 *   JMSMessageID      ↔  messageId
 *   JMSCorrelationID  ↔  correlationId
 *   JMSTimestamp      ↔  timestamp  (Date)
 *   JMSType           ↔  type
 */

export const JmsMapper = {
  /**
   * Copy JMS headers from exchange to an outbound AMQP 1.0 (rhea) message object.
   * @param {import('camel-lite-core').Exchange} exchange
   * @param {object} message  - rhea message object (mutated in place)
   */
  toAmqp10(exchange, message) {
    const h = exchange.in;
    const props = message.properties ?? {};
    message.properties = props;

    const mid = h.getHeader('JMSMessageID');
    if (mid != null) props.message_id = String(mid);

    const cid = h.getHeader('JMSCorrelationID');
    if (cid != null) props.correlation_id = String(cid);

    const ts = h.getHeader('JMSTimestamp');
    if (ts != null) props.creation_time = Number(ts);

    const type = h.getHeader('JMSType');
    if (type != null) props.subject = String(type);

    const dm = h.getHeader('JMSDeliveryMode');
    if (dm != null) {
      message.header = message.header ?? {};
      message.header.durable = (dm === 'PERSISTENT' || dm === 2);
    }

    const pri = h.getHeader('JMSPriority');
    if (pri != null) {
      message.header = message.header ?? {};
      message.header.priority = Number(pri);
    }
  },

  /**
   * Copy AMQP 1.0 (rhea) message properties to JMS headers on the exchange.
   * @param {object} message  - rhea message object
   * @param {import('camel-lite-core').Exchange} exchange
   */
  fromAmqp10(message, exchange) {
    const props = message.properties ?? {};
    const h = exchange.in;

    if (props.message_id != null) h.setHeader('JMSMessageID', String(props.message_id));
    if (props.correlation_id != null) h.setHeader('JMSCorrelationID', String(props.correlation_id));
    if (props.creation_time != null) h.setHeader('JMSTimestamp', Number(props.creation_time));
    if (props.subject != null) h.setHeader('JMSType', String(props.subject));

    const hdr = message.header ?? {};
    if (hdr.durable != null) h.setHeader('JMSDeliveryMode', hdr.durable ? 'PERSISTENT' : 'NON_PERSISTENT');
    if (hdr.priority != null) h.setHeader('JMSPriority', hdr.priority);
  },

  /**
   * Copy JMS headers from exchange to an outbound amqplib 0-9-1 message options object.
   * @param {import('camel-lite-core').Exchange} exchange
   * @param {object} options  - amqplib sendToQueue options (mutated in place)
   */
  toAmqp091(exchange, options) {
    const h = exchange.in;

    const mid = h.getHeader('JMSMessageID');
    if (mid != null) options.messageId = String(mid);

    const cid = h.getHeader('JMSCorrelationID');
    if (cid != null) options.correlationId = String(cid);

    const ts = h.getHeader('JMSTimestamp');
    if (ts != null) options.timestamp = Math.floor(Number(ts) / 1000); // amqplib: seconds

    const type = h.getHeader('JMSType');
    if (type != null) options.type = String(type);

    const dm = h.getHeader('JMSDeliveryMode');
    if (dm != null) options.deliveryMode = (dm === 'PERSISTENT' || dm === 2) ? 2 : 1;

    const pri = h.getHeader('JMSPriority');
    if (pri != null) options.priority = Number(pri);
  },

  /**
   * Copy amqplib 0-9-1 message properties to JMS headers on the exchange.
   * @param {object} msg  - amqplib message object (msg.properties)
   * @param {import('camel-lite-core').Exchange} exchange
   */
  fromAmqp091(msg, exchange) {
    const props = msg.properties ?? {};
    const h = exchange.in;

    if (props.messageId != null) h.setHeader('JMSMessageID', String(props.messageId));
    if (props.correlationId != null) h.setHeader('JMSCorrelationID', String(props.correlationId));
    if (props.timestamp != null) h.setHeader('JMSTimestamp', Number(props.timestamp) * 1000); // back to ms
    if (props.type != null) h.setHeader('JMSType', String(props.type));
    if (props.deliveryMode != null) h.setHeader('JMSDeliveryMode', props.deliveryMode === 2 ? 'PERSISTENT' : 'NON_PERSISTENT');
    if (props.priority != null) h.setHeader('JMSPriority', props.priority);
  },
};

export default JmsMapper;
