import json,pathlib
root=pathlib.Path(__file__).resolve().parents[1]/'n8n'/'workflows';root.mkdir(exist_ok=True,parents=True)
settings={'executionOrder':'v1','saveDataSuccessExecution':'none','saveDataErrorExecution':'none','saveManualExecutions':False,'timezone':'Asia/Dhaka'}
def workflow(group,body=None,path='/api/operations',method='POST',special=None):
 name=f'FlowPi V5.2 | {group} | SANDBOX INACTIVE'
 trigger={'id':'trigger','name':'Manual sandbox test','type':'n8n-nodes-base.manualTrigger','typeVersion':1,'position':[0,0],'parameters':{}}
 if special=='schedule':trigger.update(name='Inactive schedule',type='n8n-nodes-base.scheduleTrigger',typeVersion=1.2,parameters={'rule':{'interval':[{'field':'hours','hoursInterval':1}]}})
 if special=='error':trigger.update(name='Error event',type='n8n-nodes-base.errorTrigger',parameters={})
 payload={'merchant_id':'REPLACE_DEV_MERCHANT_UUID',**(body or {})}
 code="return [{json:"+json.dumps(payload,ensure_ascii=False)+"}];"
 if special=='error':code="return [{json:{merchant_id:'REPLACE_DEV_MERCHANT_UUID',action:'incident',code:'n8n_execution_failed',correlation:String($json.execution?.id ?? $execution.id)}}];"
 nodes=[trigger,{'id':'envelope','name':'Synthetic configuration','type':'n8n-nodes-base.code','typeVersion':2,'position':[240,0],'parameters':{'jsCode':code}},{'id':'api','name':'Authenticated FlowPi API','type':'n8n-nodes-base.httpRequest','typeVersion':4.2,'position':[480,0],'parameters':{'method':method,'url':'https://REPLACE_PREVIEW_HOST'+path,'authentication':'genericCredentialType','genericAuthType':'httpHeaderAuth','options':{'timeout':60000},**({'sendBody':True,'specifyBody':'json','jsonBody':'={{ JSON.stringify($json) }}'} if method=='POST' else {})},'retryOnFail':False}]
 if group.startswith('W02'):
  # Durable order confirmation is never executed from an orchestration node.
  nodes[1]['parameters']['jsCode']="throw new Error('W02 notifications intentionally blocked: approved sender and durable worker credentials are not configured. Orders are confirmed transactionally in the backend.');"
 w={'name':name,'active':False,'nodes':nodes,'connections':{trigger['name']:{'main':[[{'node':'Synthetic configuration','type':'main','index':0}]]},'Synthetic configuration':{'main':[[{'node':'Authenticated FlowPi API','type':'main','index':0}]]}},'settings':settings,'pinData':{}}
 (root/(group.split(' ')[0]+'.json')).write_text(json.dumps(w,indent=2,ensure_ascii=False)+'\n')
workflow('W01 Conversation',{'event_id':'REPLACE_UNIQUE_TEST_EVENT','customer_id':'synthetic-n8n-test','channel':'website','text':'vai black shoe 42 size ase? price koto?'},'/api/w01')
workflow('W02 Order events')
workflow('W03 Courier sandbox',{'action':'shipment','order_id':'REPLACE_CONFIRMED_TEST_ORDER_UUID','state':'booked'})
workflow('W04 Follow-up review',{'action':'followups'},special='schedule')
workflow('W05 Human support',{'action':'takeover','channel':'website','customer_id':'synthetic-n8n-test','take':True})
workflow('W06 Reports',path='/api/reports?merchant=REPLACE_DEV_MERCHANT_UUID',method='GET',special='schedule')
workflow('W07 Incident recovery',special='error')
