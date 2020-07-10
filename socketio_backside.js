var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var format = require('string-format');
express = require('express'),
    path = require('path'),
    log4js = require('log4js'),
    enumObj = require('enum'),
    FCM = require('fcm-node'),
    apns = require('apn'),
    mysql = require('mysql');

//===== TABLES ======
var TABLE_CHAT_MODULE = "tbl_chat_message";
var TABLE_USERS = "tbl_users";
var TABLE_CONVERSION = "tbl_conversion";
var TABLE_MEDIA = "tbl_media";
var TABLE_APP_TOKENS = "app_tokens";
var TABLE_NOTIFICATION = "tbl_notification";

var NOTIFICATION_MESSAGE_TYPE = 8;

var pool = mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'database123',
    charset: 'utf8mb4'
});


var users = [];

var FCM_SERVER_KEY = "***************************";
var SUCCESS = "success";
var FAILED = "failed";


// log4js.configure({
//  appenders: {file123: {type: 'file', filename: 'file123.log', mode: '777'}},
//  categories: {default: {appenders: ['file123'], level: 'error'}}
//  });
//  const logger = log4js.getLogger('peakApp');

 var logger = log4js.getLogger('peakApp');

http.listen(1910, function () {
    console.log('listening on *:1910');
});
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/socket_frontend.html');
});


io.on('connection', function (client) {
    console.log('connected ==>' + client.id);

    /**
     * here is function of join socket connection
     */
    client.on('JoinSocket', function (data, callback) {

        //console.log("nirav"+data.id);
        logger.level = 'debug';
        logger.debug("Join socket");

        if (typeof data.id === "undefined") {
            console.log("Please pass user id");

        } else {

            client.join(data.id);
            client.user_id = data.id;

            if (users.length <= 0) {
                console.log("**** First User ****--->" + data.id);
                users.push(data.id);
            }
            else {
                var userAvailable = isInArray(data.id, users);
                if (userAvailable == false) {
                    console.log("**** New  User ****--->" + data.id);
                    users.push(data.id);
                }

            }
            if (typeof callback === "function") {
                callback({status: SUCCESS});
            }

        }
        console.log(users,'avalible user 0');
    });

    /**
     * here is function of send message
     */
    client.on('SendNewMessage', function (data, callback) {

        var finalObj = {};
        var created_date = getCurrentUTCDateTime();

        var is_delete = 0;

        var insertNewChat = "INSERT INTO " + TABLE_CONVERSION + " (created_by, recevied_by, last_message, created_date, modified_date, is_testdata) " +
            "VALUES (?,?,?,?,?,?)";

        var chatInfo = "SELECT conversion_id FROM " + TABLE_CONVERSION + " c " + 
        "WHERE ((c.created_by = "+data.sender_id+" AND c.recevied_by = "+data.receiver_id+") OR (c.created_by = "
        +data.receiver_id+" AND c.recevied_by = "+data.sender_id+")) AND c.is_delete = 0 AND c.is_testdata="+data.is_testdata+"";

        var insertExistChat = "INSERT INTO " + TABLE_CHAT_MODULE + " ( conversion_id, sender_id, receiver_id, message_type, message_type_caption, chat_message, created_date, is_testdata) " +
            "VALUES (?,?,?,?,?,?,?,?)";

        var updateLastMessage = "UPDATE " + TABLE_CONVERSION + " SET last_message = ?, modified_date = '"+created_date+"' WHERE  ((created_by = "+data.sender_id+" AND recevied_by = "+data.receiver_id+") OR (created_by = "
        +data.receiver_id+" AND recevied_by = "+data.sender_id+"))";

        var insertMedia = "INSERT INTO "+TABLE_MEDIA+" (post_id, post_type, media_type, media_name, created_date, is_testdata) VALUES(?,4,?,?,?,?)";



        executeQuery(chatInfo, '', function (err, chatResult, fields) {
            if (err) {
                logger.error(new Error().stack + err);
                throw err;
            } else {
                if (typeof chatResult !== 'undefined' && chatResult.length > 0) {
                    var messageType = data.message;
                    executeQuery(insertExistChat, [chatResult[0].conversion_id, data.sender_id, data.receiver_id, data.message_type, data.message_type_caption, data.message, created_date, data.is_testdata], function (err, result, fields) {
                        if (err) {
                            logger.error(new Error().stack + err);
                            throw err;
                        }
                        

                        data.message_id = result.insertId;
                        data.created_date = created_date;

                        if(data.message_type == 'IMAGE' || data.message_type == 'VIDEO'){
                            executeQuery(insertMedia, [data.message_id, data.message_type, data.media_name, created_date, data.is_testdata], function (err, result2, fields) {
                            if (err) {
                                logger.error(new Error().stack + err);
                                throw err;
                            }
                            });
                        }

                        if(data.message_type == 'IMAGE'){
                            messageType = 'IMAGE';
                        }else if(data.message_type == 'VIDEO'){
                            messageType = 'VIDEO'; 
                        }

                        executeQuery(updateLastMessage, [messageType], function (err, result1, fields) {
                            if (err) {
                                logger.error(new Error().stack + err);
                                throw err;
                            }
                        });


                        var mediaObj = {};
                        if(data.message_type == 'IMAGE' || data.message_type == 'VIDEO'){
                            mediaObj = {
                                media_id:'',
                                feed_image:data.media_name,
                                type:data.message_type
                            };
                        }
                        
                        finalObj = {
                            conversion_id:stringToInt(chatResult[0].conversion_id),
                            sender_id:stringToInt(data.sender_id),
                            receiver_id:stringToInt(data.receiver_id),
                            message_type:data.message_type,
                            message_type_caption:data.message_type_caption,
                            message:data.message,
                            created_date:created_date,
                            is_testdata:stringToInt(data.is_testdata),
                            media:mediaObj
                        }

                        if (typeof callback === "function") {
                            callback(finalObj);
                        }
                        console.log(finalObj,'first');
                        var userAvailable = isInArray(data.receiver_id, users);
                        if (userAvailable === true) {
                            console.log(finalObj,'second');
                            io.in(data.receiver_id).emit("ReceiveMessage", finalObj);
                        }else{
                            if(directPush(finalObj)){
                                console.log('message send');
                            }else{
                                console.log('message failed');
                            }
                        }

                    });


                }else{
                    var messageType = data.message;

                    if(data.message_type == 'IMAGE'){
                        messageType = 'PEAK_IMAGE';
                    }else if(data.message_type == 'VIDEO'){
                        messageType = 'PEAK_VIDEO';
                    }
                    executeQuery(insertNewChat, [data.sender_id, data.receiver_id, messageType, created_date, created_date, data.is_testdata], function (err, result, fields) {
                        if (err) {
                            logger.error(new Error().stack + err);
                            throw err;
                        }
                        var tempId = result.insertId;
                        data.created_date = created_date;

                        executeQuery(insertExistChat, [tempId, data.sender_id, data.receiver_id, data.message_type, data.message_type_caption, data.message, created_date, data.is_testdata], function (err, result1, fields) {
                            if (err) {
                                logger.error(new Error().stack + err);
                                throw err;
                            }
                            data.message_id = result1.insertId;

                            if(data.message_type == 'IMAGE' || data.message_type == 'VIDEO'){
                                executeQuery(insertMedia, [data.message_id, data.message_type, data.media_name, created_date, data.is_testdata], function (err, result2, fields) {
                                if (err) {
                                    logger.error(new Error().stack + err);
                                    throw err;
                                }
                                });
                            }
                        });

                        var mediaObj = {};
                        if(data.message_type == 'IMAGE' || data.message_type == 'VIDEO'){
                            mediaObj = {
                                media_id:'',
                                feed_image:data.media_name,
                                type:data.message_type
                            };
                        }

                        finalObj = {
                            conversion_id:stringToInt(tempId),
                            sender_id:stringToInt(data.sender_id),
                            receiver_id:stringToInt(data.receiver_id),
                            message_type:data.message_type,
                            message_type_caption:data.message_type_caption,
                            message:data.message,
                            created_date:created_date,
                            is_testdata:stringToInt(data.is_testdata),
                            media:mediaObj
                        }

                        if (typeof callback === "function") {
                            callback(finalObj);
                        }
                        console.log(finalObj,'first');
                        var userAvailable = isInArray(data.receiver_id, users);
                        if (userAvailable === true) {
                            console.log(finalObj,'second');
                            io.in(data.receiver_id).emit("ReceiveMessage", finalObj);
                        }else{
                            if(directPush(finalObj)){
                                console.log('message send');
                            }else{
                                console.log('message failed');
                            }
                        }

                    });
                }
                console.log(chatResult);
                //console.log(chatResult[0].conversion_id);
            }
        });

    });
    
    client.on('ReadMessage', function (data, callback) {

        var is_delete = 0;
        var updateReadMessage = "UPDATE "+TABLE_CHAT_MODULE+" SET is_read=1 WHERE conversion_id = ? AND receiver_id = ? AND is_delete="+is_delete+"";
        
        executeQuery(updateReadMessage, [data.conversion_id,data.receiver_id], function (err, result, fields) {
            if (err) {
                logger.error(new Error().stack + err);
                throw err;
            }
        });

    });

    // function sendPushToReceiver(data) {

    //     var userInfo = format("SELECT device_token,device_type FROM " + TABLE_APP_TOKENS + " u " +
    //         "WHERE user_id = {} AND device_token IS NOT NULL ", data.receiver_id);

    //     executeQuery(userInfo, '', function (err, userResult, fields) {
    //         if (err) {
    //             logger.error(new Error().stack + err);
    //             throw err;
    //         } else {

    //             var rec_id = {
    //                 sender_id: data.receiver_id
    //             };

    //             var messageInfo = data.message;
    //             console.log(messageInfo);
    //             var device_token = userResult[0].device_token;
    //             console.log(device_token);

    //             var fcm = new FCM(SERVER_KEY);
    //             var message = {
    //                 to: userResult[0].device_token,
    //                 priority:"high",
    //                 data: {  //you can send only notification or only data(or include both)
    //                     body:messageInfo,


    //                 }

    //             };
    //             fcm.send(message, function (err, response) {
    //                 if (err) {
    //                     console.log(err);
    //                 } else {
    //                     console.log("Successfully sent with response: ", response);
    //                 }
    //             });


    //         }
    //     });
    // }

    function directPush(finalObj, payload) {
        console.log(finalObj.sender_id,'sender_id');
        console.log(finalObj.receiver_id,'receiver_id');
        var isSendBox = 0;

        var firstName = '';
        var lastName = '';
        var fullName = '';

        var otherUserImage = '';

        var notify_badge = 0;
        var conversion_badge = 0;

        var deviceInfo = "SELECT device_token,device_type FROM " + TABLE_APP_TOKENS + " u " +
             "WHERE user_id = '"+finalObj.receiver_id+"' AND device_token IS NOT NULL";

        var userInfo = "SELECT first_name, last_name FROM " + TABLE_USERS +
             " WHERE user_id = '"+finalObj.sender_id+"' AND is_delete = 0";

        var userImage = "SELECT media_name FROM " + TABLE_MEDIA +
             " WHERE post_id = '"+finalObj.sender_id+"' AND post_type = 1 AND is_delete = 0";

        var conversionBadge = "SELECT COUNT(DISTINCT(conversion_id)) as conversion_badge FROM "+TABLE_CHAT_MODULE+" WHERE receiver_id = "+finalObj.receiver_id+" AND is_read = 0 AND is_delete = 0";

        var notificationBadge = "SELECT COUNT(*) as notify_badge FROM "+TABLE_NOTIFICATION+" WHERE received_by = "+finalObj.receiver_id+" AND is_read = 0 AND is_delete = 0";

        executeQuery(notificationBadge,'',function(err,userResult,fields){
            if (err) {
                logger.error(new Error().stack + err);
                throw err;
            } else {
                notify_badge = userResult[0].notify_badge;
                console.log(userResult,'11111');
            }
        });

        executeQuery(conversionBadge,'',function(err,userResult,fields){
            if (err) {
                logger.error(new Error().stack + err);
                throw err;
            } else {
                conversion_badge = userResult[0].conversion_badge;
                console.log(userResult,'22222');
            }
        });

        executeQuery(deviceInfo, '', function (err1, userResult1, fields) {
            if (err1) {
                logger.error(new Error().stack + err1);
                throw err1;
            } else {
                executeQuery(userInfo, '', function (err2, userResult2, fields) {
                    if (err2) {
                        logger.error(new Error().stack + err2);
                        throw err2;
                    } else {
                        executeQuery(userImage, '', function (err3, userResult3, fields) {
                            if (err3) {
                                logger.error(new Error().stack + err3);
                                throw err3;
                            }else{
                                
                                otherUserImage = userResult3[0].media_name;

                                firstName = userResult2[0].first_name;
                                lastName = userResult2[0].last_name;
         
                                fullName = firstName+' '+lastName;

                                if(userResult1[0].device_type == 1){
                                    var options = {
                                        token: {
                                            key: "../PushNotificationKey/something.p8",
                                            keyId: "******",
                                            teamId: "*******"
                                        },
                                        production: true //false
                                    };
                                    
                                    var apnProvider = new apns.Provider(options);

                                    if (apnProvider == null) {
                                    }
                                    var dict = {};
                                    var data = {};
                                    
                                    payload = {
                                        "notification_type": NOTIFICATION_MESSAGE_TYPE,
                                        "send_by": finalObj.sender_id,
                                        "receiver_by": finalObj.receiver_id,
                                        "user_id": finalObj.receiver_id,
                                        "other_user_id": finalObj.sender_id,
                                        "other_user_first_name": firstName,
                                        "other_user_last_name": lastName,
                                        "other_user_profile_pic":otherUserImage,
                                        "conversion_id": finalObj.conversion_id,
                                        "message_type":finalObj.message_type,
                                        "message_type_caption":finalObj.message_type_caption,
                                        "message":finalObj.message,
                                        "created_date":finalObj.created_date,
                                        "is_testdata":finalObj.is_testdata,
                                        "media":finalObj.media
                                    };
                                    dict['payload'] = payload;

                                    var note = new apns.Notification();
                                    note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
                                    //note.title = "Peak";
                                    //note.sound = "ping.aiff";
                                    note.badge = parseInt(notify_badge) + parseInt(conversion_badge);
                                    note.alert = fullName+' sent you a message.';//'\ud83d\ude0a';//"\uD83D\uDCE7 \u2709 You have a new message. ";
                                    note.payload = dict;//[{'messageFrom': PayloadData },{'type':"ChatMSG"}];
                                    note.topic = "com.PeakDemo";

                                    console.log(note,'000000');
                                    apnProvider.send(note, userResult1[0].device_token).then(function (notificationResult) {
                                        // Check the result for any failed devices
                                        apnProvider.shutdown();
                                    });
                                    return true;
                                }else if(userResult1[0].device_type == 2){

                                    payload = {
                                        "notification_type": NOTIFICATION_MESSAGE_TYPE,
                                        "sender_id": finalObj.sender_id,
                                        "receiver_id": finalObj.receiver_id,
                                        "other_user_first_name": firstName,
                                        "other_user_last_name": lastName,
                                        "other_user_profile_pic":otherUserImage,
                                        "conversion_id": finalObj.conversion_id,
                                        "message_type1":finalObj.message_type,
                                        "message_type_caption":finalObj.message_type_caption,
                                        "chat_message":finalObj.message,
                                        "message":fullName+' sent you a message.',
                                        "created_date":finalObj.created_date,
                                        "is_testdata":finalObj.is_testdata,
                                        "media":finalObj.media
                                    };

                                    var device_token = userResult1[0].device_token;
                                    console.log(device_token);

                                    var fcm = new FCM(FCM_SERVER_KEY);
                                    var message = {
                                        to: device_token,
                                        priority:"high",
                                        data: payload

                                    };
                                    console.log(message);
                                    fcm.send(message, function (err, response) {
                                        if (err) {
                                            console.log(err);
                                            return false;
                                        } else {
                                            console.log("Successfully sent with response: ", response);
                                            return true;
                                        }
                                    });

                                }else{
                                    return false;
                                }
                            }
                        });
                    }
                });
                
            }
        });
    }

    /**
     * here is function of disconnect socket connection
     */
    client.on('disconnect', function (data, callback) {

        console.log("****Disconnect soket****");

        var deleteUser = isInArray(client.user_id, users);
        console.log(deleteUser);
        console.log(users,'avalible user 1');
        if (deleteUser == true) {
            if (typeof client.user_id === "undefined") {

            } else {
                //delete user from group.
                console.log("user " + client.user_id);
                console.log(users, 'avalible user before delete');
                // delete users[client.user_id];
                deleteFromArray(users, client.user_id);
                console.log("users " + users);
                console.log(users, 'avalible user after delete');
            }
        }
        else {
        }
        console.log(users,'avalible user 2');
    });

    function getCurrentUTCDateTime() {
        return new Date().toISOString().replace(/T/, ' ').// replace T with a space
        replace(/\..+/, '');
    }

    function isInArray(user, userArray) {
        //return userArray.indexOf(user) > -1;

        var length = userArray.length;
        for (var i = 0; i < length; i++) {
            if (userArray[i] == user)
                return true;
        }
        return false;
    }

    function deleteFromArray(my_array, element) {
        const index = my_array.indexOf(element);
        my_array.splice(index, 1);

    }

    function executeQuery(sql, parma, sql_rescponce_callack) {
        pool.getConnection(function (err, connection) {
            if (err) {
                logger.error(sql + '  : getConnection THROW :' + err);
                return;
            }
            var query = connection.query(sql, parma, sql_rescponce_callack);
            if (typeof query === "undefined") {

            } else {
                query.on('error', function (err) {
                    logger.error(sql + ' : query FROM :' + err);
                    throw err;
                });
                query.on('end', function () {
                    connection.release();
                });
            }
        });
    }

    function stringToInt($string){
        return parseInt($string);
    }


});
