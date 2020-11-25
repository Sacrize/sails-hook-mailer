const nodemailer = require('nodemailer');

module.exports = function (sails) {

    let config;
    let transporter;

    sails.on('ready', function () {
        _checkDependencies();
    });

    return {
        defaults: {
            __configKey__: {
                enableQueue: false,
                queueName: 'mails',
                queueExecutorBatch: 10,
                queueExecutorCronJobName: 'mailsQueueExecutor',
                queueExecutorCronJobSchedule: '*/5 * * * * *',
            },
        },
        configure: function () {
            config = sails.config[this.configKey];
            if (config.enableQueue) {
                sails.config.queues = sails.config.queues || {};
                sails.config.queues[config.queueName] = {};
                sails.config.cron = sails.config.cron || {};
                sails.config.cron[config.queueExecutorCronJobName] = {
                    schedule: config.queueExecutorCronJobSchedule,
                    onTick: function () {
                        _executeFromQueue();
                    }
                }
            }
        },
        initialize: function () {
            sails.log.info('Initializing hook (`sails-hook-mailer`)');
        },
        send: _send,
    }

    function _send(params, force) {
        if (config.enableQueue && !force) {
            _pushToQueue(params);
        } else {
            _sendEmail(params);
        }
    }
    function _pushToQueue(params) {
        sails.hooks.queues.push(config.queueName, params);
    }
    function _executeFromQueue() {
        if (!sails.hooks.queues.isReady(config.queueName)) {
            return;
        }
        for (let i = 0; i < config.queueExecutorBatch; i++) {
            sails.hooks.queues.pop(config.queueName)
                .then((res) => {
                    if (res) {
                        _sendEmail(res.message);
                    }
                });
        }
    }
    function _sendEmail(params) {
        _getTransporter().sendMail(params)
            .then(() => {
                sails.log.debug('Email sent:', params.subject);
            })
            .catch((err) => {
                sails.log.error(err);
            });
    }
    function _getTransporter() {
        if  (!transporter) {
            transporter = nodemailer.createTransport({
                SES: sails.hooks.aws.SES(),
            });
        }
        return transporter;
    }
    function _checkDependencies() {
        let modules = [];
        if (!sails.hooks.aws) {
            modules.push('sails-hook-aws');
        }
        if (config.enableQueue) {
            if (!sails.hooks.cron) {
                modules.push('sails-hook-cron');
            }
            if (!sails.hooks.queues) {
                modules.push('sails-hook-custom-queues');
            }
        }
        if (modules.length) {
            throw new Error('To use hook `sails-hook-mailer`, you need to install the following modules: ' + modules.join(', '));
        }
    }
}
