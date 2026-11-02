const transport={pending:'待发送',sending:'发送中',failed:'发送失败',unknown:'结果待核对',accepted:'通道已接收'};
export function deliveryLabel(item){
 const receipt=item.receipt;
 return (transport[item.status]||'待核验')+'；'+(receipt?receipt.received?'本人确认已看到':'本人确认未收到':'本人尚未确认');
}
export function notificationHealth(health,channel){
 const delivery=health?.lastDelivery;
 if(delivery)return {text:deliveryLabel(delivery),confirmed:delivery.receipt?.received===true};
 return {text:channel==='desktop'?(health?.available?'系统支持，送达未验':'APP通知待核验'):(health?.ready&&health?.targetConfigured?'已绑定，送达未验':'待绑定飞书'),confirmed:false};
}
