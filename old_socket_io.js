var express = require('express'),
app = express(),
http = require('http').Server(app),
exec = require('child_process').exec,
util = require('util');



var server = require('http').createServer(app).listen(3000);
var io = module.exports = require("socket.io").listen(server);	// Socket.IO

// callback of eval function
function puts(error, stdout, stderr) { console.log('Error while sending notification --> ' + error); }

var mysql = require('mysql');

var pool = mysql.createPool({

    connectionLimit: 10,

    host: 'localhost',

    user: 'EezyBeeUser1',

    password: 'EezyBeeUser1!',

    database: 'eezybee'

});
function init() {
   // io.set('transports', ['websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);

    //var io = require('socket.io')(server, {'transports': ['websocket', 'polling']});

    io.setMaxListeners(0);



    // Start listening for events

    setEventHandlers();

}





var setEventHandlers = function () {

    console.log('Handshake called');

    io.sockets.on("connection", function (socket) {

        console.log('Socket conneced !! ');

        socket.on('serverToClient', function (msg) {



            // console.log('>>> INPUT DATA >>>>> ', msg);

            data = msg.data;



            switch (msg.eventName) {

                case 'chatting':

                {

                sendMessage(socket, data);

                    break;

                }

                case 'bindUser':

                {

                bindUser(socket, msg);

                    break;

                }

                case 'markAsReadChat':

                {

                markAsReadChat(socket, data);

                    break;

            }



                case 'userTyping':

                {

                    userTyping(socket, data);

                    break;

                }

                default:

                {

                    console.log('Invalid event')

                }

            }





        });



        socket.on("disconnect", function () {

            console.log('disconnect >> ', socket.id);

            sql = 'update eb_user set socket_id = "" where socket_id = "' + socket.id + '" ';

            pool.query(sql, function (error, results, fields) {

                if (error)

                    throw error;



            });

        })



    });



};



init(); // START PROCESING  - INITIALISE

app.engine('.html', require('ejs').__express);

app.get('/', function (req, res) {

    res.render('index.html', {});

});





function sendMessage(socket, data) {



    var content_type = (typeof data.content_type == 'undefined' ? 'TEXT' : data.content_type);

    console.log(data.text);
    console.log(' ---------- ');
    var created_on = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    sql = ' Insert into eb_chatting_content (  chat_id , user_id , text,content_type , created_on ) values(  "' + data.chat_id + '","' + data.user_id + '","' + data.text.toString("utf8") + '","' + content_type + '" , "' + created_on + '" ) ';

    pool.query(sql, function (error, chattingContent, fields) {

        if (error)

            throw error;



        sql = ' select * from eb_chat ch where chat_id = "' + data.chat_id + '" ';

        pool.query(sql, function (error, results, fields) {

            if (error)

                throw error;

            if (results) {



                if (results) {

                    console.log(results);

                    sql = ' select socket_id, user_id from eb_user c where FIND_IN_SET(user_id,"' + results[0].chatting_user_id + '") >  0  ';

                    pool.query(sql, function (error, socket_results, fields) {

                        //(select socket_id from eb_user c where ch.user_id = c.user_id ) as socket_id



                        // sql = ' select cm.* , eb_user.user_name ,c.up_profile_pic from eb_chatting_content cm ,eb_user, eb_user_profile c where c.user_id = cm.user_id and  cm.content_id = "' + chattingContent.insertId + '" ';
                        sql = 'select eb_chatting_content.* , eb_user.user_name ,eb_user_profile.up_profile_pic from eb_chatting_content';
                          sql +=     ' LEFT JOIN eb_user ON eb_user.user_id = eb_chatting_content.user_id';
                           sql +=    ' LEFT JOIN eb_user_profile ON eb_user_profile.user_id = eb_chatting_content.user_id';
                            sql +=   ' where eb_chatting_content.content_id = '+chattingContent.insertId;
                        console.log(sql);
                        pool.query(sql, function (error, comment_data_data, fields) {

                            if (error)

                                throw error;
                            console.log(comment_data_data);


                            comment_data_data = comment_data_data[0];

                            comment_data_data.created_on1 = created_on;//comment_data_data.created_on;

                            comment_data_data.created_on = "Just Now";

                            

                            sql = ' update eb_chat set last_message_datetime = "' + created_on + '" where chat_id = "' + data.chat_id + '" ';

                            pool.query(sql, function (error, socket_results, fields) {



                            })
sql = ' update eb_chat set deleted_user_id = 0 where chat_id = "' + data.chat_id + '" ';

                            pool.query(sql, function (error, socket_results, fields) {



                            })
                            // console.log(socket_results);

                            // [start][dv] - Send msg and user is offline then send notification
                            for (x in socket_results) {
                                if(socket_results[x].user_id == comment_data_data.user_id){
                                    console.log('Dont send event to a same user');
                                }else{
                                var findUserQuery = 'SELECT mobile_token_id, mobile_token_type, user_id  FROM eb_user where mobile_msg_notify=1 AND user_id = '+ socket_results[x].user_id;
                                console.log(findUserQuery);
                                pool.query(findUserQuery, function (error, user, fields) {
                                    for (result in user){

                                            var senderName = comment_data_data.user_name; 
                                            var opponent_id = comment_data_data.user_id;
                                            var user_id = socket_results[x].user_id;
                                            var token = user[result].mobile_token_id;
                                            var deviceType = user[result].mobile_token_type;
                                            if(token == '' || deviceType == ''){
                                                console.log('---E-M-P-T-Y---');
                                            }else{
                                                exec('php /var/www/html/index.php messages/send_notification '+token+' '+deviceType+' "'+senderName+'" '+user_id+' '+opponent_id  , puts);
                                            }
                                    }
                                });
                                }
                                socketSend(socket_results[x].socket_id, {"eventName": "chatting", "data": comment_data_data}, socket_results[x].user_id);

                            }

                        });

                    })



                }

            }



        });



    });



}



function bindUser(socket, data) {


	// console.log(data);
    sql = 'update eb_user set is_online = 1 , socket_id = "' + socket.id + '" where user_id = "' + data.user_id + '" ';
    pool.query(sql, function (error, results, fields) {

        if (error)
            throw error;
        console.log(' Updated socket into table ');
    });



    socket.emit('clientToServer', {"eventName": "bindUser", "data": {}});

    

    



}



function markAsReadChat(socket, data) {

    sql = ' update eb_chat_unread_message_counter set counter = "0" where chat_id = "' + data.chat_id + '" and user_id = "' + data.user_id + '" ';

    console.log('markAsReadChat called >> ', sql);

    pool.query(sql, function (error, results, fields) {

        if (error)

            throw error;

    })

}



function userTyping(socket, data) {

    console.log(data);

    sql = ' select * from eb_chat ch where chat_id = "' + data.chat_id + '" ';

    pool.query(sql, function (error, results, fields) {

        if (error)

            throw error;

        if (results) {

            // console.log(results);
            // console.log("results ^^^^^^^^^^");



            sql = ' select socket_id, user_id from eb_user c where FIND_IN_SET(user_id,"' + results[0].chatting_user_id + '") >  0  '; // user_id != "'+ data.user_id + '" and

            // console.log(sql);

            pool.query(sql, function (error, socket_results, fields) {

                for (x in socket_results) {

                    if(typeof socket_results[x].socket_id != 'undefined' && socket_results[x].socket_id != ''  && socket_results[x].user_id !=  data.user_id )  {

                        console.log('userTyping sockets id : ', socket_results[x].socket_id);                        

                        brodcastEmit(socket_results[x].socket_id, {'eventName': "userTyping", "data": data });

                    }

                }

            });

        }

    });



}



function socketSend(socket_id, data, user_id) {

    //console.log('socketSend >>',socket_id,data)

    var commentData = data.data;

    sql = ' update  eb_chat_unread_message_counter c set counter = counter+1 where chat_id = ' + commentData.chat_id + ' and user_id =  ' + user_id + ' ';

    pool.query(sql, function (error, res, fields) {

        if (error)

            throw error;



        if (res.changedRows == '0') {

            sql = ' Insert into eb_chat_unread_message_counter (  chat_id , user_id , counter  ) values(  "' + commentData.chat_id + '","' + user_id + '",1 ) ';

            pool.query(sql, function (error, chatContent, fields) {

                if (error)

                    throw error;

                
          });

        }

                         

        brodcastEmit(socket_id,data);

    })



}
function brodcastEmit(socket_id,data){

    io.to(socket_id).emit('clientToServer', data);

}
