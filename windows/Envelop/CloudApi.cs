using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using System.IO;
namespace Envelop;
public sealed class CloudApi {
 public const string Tomato="00000000-0000-0000-0000-000000000001";
 readonly HttpClient http = new(){Timeout=TimeSpan.FromSeconds(20)};
 readonly SemaphoreSlim gate=new(1,1);
 readonly string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Envelop");
 public string Url { get; private set; }="";
 string key=""; JsonElement? token; DateTimeOffset expires=DateTimeOffset.MinValue;
 public bool Configured=>Url.Length>0 && key.Length>0;
 public string UserId=>token?.GetProperty("user").GetProperty("id").GetString() ?? "";
 public CloudApi() {
  Directory.CreateDirectory(folder);
  if(File.Exists(Path.Combine(folder,"config.json"))) {
   var config=JsonDocument.Parse(File.ReadAllText(Path.Combine(folder,"config.json"))).RootElement;
   Url=config.GetProperty("url").GetString()!;key=config.GetProperty("key").GetString()!;
  }
  if(File.Exists(Path.Combine(folder,"session.bin"))) {
   try { token=JsonDocument.Parse(ProtectedData.Unprotect(File.ReadAllBytes(Path.Combine(folder,"session.bin")),Encoding.UTF8.GetBytes(Url),DataProtectionScope.CurrentUser)).RootElement.Clone(); }
   catch(CryptographicException) { /* Windows account or configured project changed. */ }
  }
 }
 public void Configure(string url,string publicKey) {
  if(!Uri.TryCreate(url.Trim(),UriKind.Absolute,out var uri) || uri.Scheme!="https" || uri.UserInfo!="" || uri.Query!="" || uri.Fragment!="") throw new Exception("Use your Supabase project's HTTPS URL.");
  if(string.IsNullOrWhiteSpace(publicKey))throw new Exception("Enter the public project key.");
  var next=url.Trim().TrimEnd('/');
  if(next!=Url) {token=null;expires=DateTimeOffset.MinValue;File.Delete(Path.Combine(folder,"session.bin"));}
  Url=next;key=publicKey.Trim();File.WriteAllText(Path.Combine(folder,"config.json"),JsonSerializer.Serialize(new{url=Url,key}));
 }
 void Save(JsonElement session) {
  var encrypted=ProtectedData.Protect(Encoding.UTF8.GetBytes(session.GetRawText()),Encoding.UTF8.GetBytes(Url),DataProtectionScope.CurrentUser);
  var path=Path.Combine(folder,"session.bin");File.WriteAllBytes(path+".tmp",encrypted);File.Move(path+".tmp",path,true);
  token=session;expires=DateTimeOffset.UtcNow.AddSeconds(session.GetProperty("expires_in").GetDouble());
 }
 async Task<JsonElement> Http(string path,object? body=null,bool authenticated=true) {
  using var request=new HttpRequestMessage(body==null?HttpMethod.Get:HttpMethod.Post,$"{Url}/{path}");
  request.Headers.Add("apikey",key);
  if(authenticated)request.Headers.Authorization=new("Bearer",token!.Value.GetProperty("access_token").GetString());
  if(body!=null) request.Content=JsonContent.Create(body);
  using var response=await http.SendAsync(request);
  var data=await response.Content.ReadAsStringAsync();
  JsonElement result;
  try {result=JsonDocument.Parse(string.IsNullOrWhiteSpace(data)?"null":data).RootElement.Clone();}
  catch(JsonException){throw new Exception($"Network request failed ({(int)response.StatusCode}).");}
  if(!response.IsSuccessStatusCode)throw new Exception(result.TryGetProperty("message",out var message)?message.GetString():result.TryGetProperty("msg",out var msg)?msg.GetString():$"Network request failed ({(int)response.StatusCode}).");
  return result;
 }
 public async Task<JsonElement> Request(string path,object? body=null) {
  await gate.WaitAsync();
  try {
   if(!Configured)throw new Exception("Configure Envelop first.");
   if(token==null)Save(await Http("auth/v1/signup",new{data=new{}},false));
   else if(expires<DateTimeOffset.UtcNow.AddSeconds(60))Save(await Http("auth/v1/token?grant_type=refresh_token",new{refresh_token=token.Value.GetProperty("refresh_token").GetString()},false));
   return await Http(path,body);
  } finally {gate.Release();}
 }
 public Task<JsonElement> Rpc(string name,object args)=>Request("rest/v1/rpc/"+name,args);
 public async Task<JsonElement?> Restore(){if(token==null)return null;await Request("rest/v1/profiles?limit=0");var rows=await Request($"rest/v1/profiles?id=eq.{UserId}&select=*");return rows.GetArrayLength()>0?rows[0]:null;}
 public async Task<List<Person>> People(string query) {
  var clean=new string(query.Where(c=>char.IsLetterOrDigit(c)||c==' '||c=='-').ToArray());
  var filter=clean.Length==0?"":"&display_name=ilike."+Uri.EscapeDataString("*"+clean+"*");
  var rows=await Request("rest/v1/profiles?select=*&order=is_device.desc,display_name.asc,id.asc&limit=50"+filter);
  var list=rows.EnumerateArray().Where(p=>p.GetProperty("id").GetString()!=UserId).Select(Person.From).ToList();
  if(!list.Any(p=>p.Device)){var pinned=await Request($"rest/v1/profiles?id=eq.{Tomato}&select=*");if(pinned.GetArrayLength()>0)list.Insert(0,Person.From(pinned[0]));}
  return list;
 }
 public async Task<List<ChatMessage>> History(string id) {
  var rows=await Request($"rest/v1/messages?conversation_id=eq.{id}&select=*&order=created_at.desc,id.desc&limit=20");
  return rows.EnumerateArray().Reverse().Select(p=>new ChatMessage(p.GetProperty("id").GetString()!,p.GetProperty("body").GetString()!,p.GetProperty("sender_id").GetString()==UserId?"You":"Them")).ToList();
 }
 public async Task<bool> Online(){var rows=await Request($"rest/v1/device_bridges?device_id=eq.{Tomato}&select=expires_at");return rows.GetArrayLength()>0&&DateTimeOffset.Parse(rows[0].GetProperty("expires_at").GetString()!)>DateTimeOffset.UtcNow;}
}
public record Person(string Id,string Name,string Handle,bool Device,bool Verified) {
 public string Label=>Name+(Verified?" ✓":"");
 public string Check=>Verified?" ✓":"";
 public static Person From(JsonElement p)=>new(p.GetProperty("id").GetString()!,p.GetProperty("display_name").GetString()!,p.GetProperty("handle").GetString()!,p.GetProperty("is_device").GetBoolean(),p.GetProperty("verified").GetBoolean());
}
public record ChatMessage(string Id,string Body,string Sender);
