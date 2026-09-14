using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using System.Text;
namespace Envelop;
public partial class MainWindow:Window {
 static readonly SolidColorBrush CheckBlue=new(Color.FromRgb(0x1D,0x9B,0xF0));
 static int DefaultAvatar(string name){var h=0;foreach(var c in name.ToLowerInvariant())h=h*31+c;return System.Math.Abs(h)%16;}
 readonly CloudApi api=new(); readonly DispatcherTimer timer=new(){Interval=TimeSpan.FromSeconds(3)};
 string? conversation; Person? selected; bool polling; int generation;
 (string chat,string text,Guid nonce)? pending;
  public MainWindow(){InitializeComponent();Loaded+=Start;timer.Tick+=async(_,_)=>await Poll();Closed+=(_,_)=>timer.Stop();}
 async void Start(object sender,RoutedEventArgs e){if(api.Configured){Setup.Visibility=Visibility.Collapsed;Onboarding.Visibility=Visibility.Visible;try{if(await api.Restore()!=null)await Ready();}catch(Exception ex){ErrorText.Text=ex.Message;}}}
  async void Enter(object sender,RoutedEventArgs e){EnterButton.IsEnabled=false;try{if(string.IsNullOrWhiteSpace(DisplayName.Text))throw new Exception("Enter your name.");await api.Rpc("create_profile",new{p_name=DisplayName.Text.Trim(),p_avatar=DefaultAvatar(DisplayName.Text.Trim())});await Ready();}catch(Exception ex){ErrorText.Text=ex.Message;}finally{EnterButton.IsEnabled=true;}}
 async Task Ready(){Onboarding.Visibility=Visibility.Collapsed;Messenger.Visibility=Visibility.Visible;ErrorText.Text="";People.ItemsSource=await api.People("");timer.Start();await Poll();}
 async void FindPeople(object sender,RoutedEventArgs e){try{People.ItemsSource=await api.People(Search.Text);}catch(Exception ex){ErrorText.Text=ex.Message;}}
 async void OpenChat(object sender,SelectionChangedEventArgs e){
   if(People.SelectedItem is not Person person)return;selected=person;conversation=null;Messages.ItemsSource=null;Draft.Text="";SetTitle(person);var current=++generation;
  try{var id=(await api.Rpc("get_or_create_dm",new{p_peer=person.Id})).GetString();if(current!=generation)return;conversation=id;await Poll();}catch(Exception ex){ErrorText.Text=ex.Message;}
 }
 async Task Poll(){if(polling)return;polling=true;var id=conversation;try{
   var online=await api.Online();SetPresence(online);
  QueueHint.Text=selected?.Device==true&&!online?"Messages wait for Tomato's bridge.":"";
  if(id!=null){var rows=await api.History(id);if(conversation==id){Messages.ItemsSource=rows;if(rows.Count>0)Messages.ScrollIntoView(rows[^1]);}}
 }catch(Exception ex){Presence.Text="Connection unavailable";ErrorText.Text=ex.Message;}finally{polling=false;}}
 void SetPresence(bool online){Presence.Inlines.Clear();Presence.Inlines.Add(new Run("Tomato"));Presence.Inlines.Add(new Run(" ✓"){Foreground=CheckBlue});Presence.Inlines.Add(new Run(online?" · Online":" · Offline"));}
 void SetTitle(Person person){ChatTitle.Inlines.Clear();ChatTitle.Inlines.Add(new Run(person.Name));if(person.Verified)ChatTitle.Inlines.Add(new Run(" ✓"){Foreground=CheckBlue});}
 void DraftKeyDown(object sender,KeyEventArgs e){
  if(e.Key!=Key.Return)return;
  if(Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))return; // Shift+Enter inserts a newline
  e.Handled=true;
  Send(sender,e);
 }
 async void Send(object sender,RoutedEventArgs e){
  if(conversation is not string id)return;var text=Draft.Text;
  if(Encoding.UTF8.GetByteCount(text) is <1 or >256){ErrorText.Text="Use 1–256 bytes.";return;}
  if(selected?.Device==true&&text.Any(c=>c<32||c>126)){ErrorText.Text="Tomato accepts printable ASCII only.";return;}
  if(pending?.chat!=id||pending?.text!=text)pending=(id,text,Guid.NewGuid());var nonce=pending.Value.nonce;SendButton.IsEnabled=false;
  try{await api.Rpc("send_message",new{p_conversation=id,p_body=text,p_nonce=nonce});pending=null;if(conversation==id&&Draft.Text==text)Draft.Clear();ErrorText.Text="";await Poll();}catch(Exception ex){ErrorText.Text=ex.Message;}finally{SendButton.IsEnabled=true;}
 }
}
